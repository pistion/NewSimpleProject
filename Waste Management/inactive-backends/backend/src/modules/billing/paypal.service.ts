import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingRepository } from './billing.repository';

interface ActorContext {
  userId: string;
  organizationId: string;
  userEmail?: string;
}

interface PayPalTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface PayPalSubscription {
  id: string;
  status: string;
  links: Array<{ href: string; rel: string; method: string }>;
}

interface PayPalWebhookEvent {
  event_type: string;
  resource: {
    id: string;
    status: string;
    custom_id?: string;
    plan_id?: string;
    billing_info?: {
      last_payment?: { amount: { value: string; currency_code: string }; time: string };
      next_billing_time?: string;
      cycle_executions?: Array<{ tenure_type: string; sequence: number; cycles_completed: number }>;
    };
  };
}

@Injectable()
export class PayPalService {
  private readonly logger = new Logger(PayPalService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly webhookId: string;
  private readonly baseUrl: string;
  private readonly frontendUrl: string;
  private readonly enabled: boolean;

  // Simple in-memory token cache
  private cachedToken: string | null = null;
  private tokenExpiry = 0;

  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly config: ConfigService,
  ) {
    this.clientId     = this.config.get<string>('PAYPAL_CLIENT_ID', '');
    this.clientSecret = this.config.get<string>('PAYPAL_CLIENT_SECRET', '');
    this.webhookId    = this.config.get<string>('PAYPAL_WEBHOOK_ID', '');
    this.frontendUrl  = this.config.get<string>('FRONTEND_URL', 'http://localhost:5173');

    const sandbox = this.config.get<string>('PAYPAL_SANDBOX', 'true') !== 'false';
    this.baseUrl = sandbox
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com';

    this.enabled = Boolean(this.clientId && this.clientSecret);
    if (!this.enabled) {
      this.logger.warn('PayPal not configured — billing/paypal endpoints will be limited.');
    } else {
      this.logger.log(`PayPal enabled (${sandbox ? 'sandbox' : 'live'})`);
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  isEnabled() {
    return this.enabled;
  }

  /**
   * Creates a PayPal subscription for the given plan and returns the approval URL.
   * Frontend redirects the user to this URL; PayPal redirects back to /billing?pp=success.
   */
  async createSubscription(planKey: string, context: ActorContext): Promise<{ approvalUrl: string }> {
    this.assertEnabled();

    const plan = await this.billingRepository.findPlanByKey(planKey);
    if (!plan || !plan.isActive) {
      throw new NotFoundException(`Plan "${planKey}" not found.`);
    }

    const paypalPlanId = (plan as { paypalPlanId?: string }).paypalPlanId;
    if (!paypalPlanId) {
      throw new BadRequestException(
        `Plan "${planKey}" does not have a PayPal plan ID configured. ` +
        `Create a billing plan in the PayPal dashboard and set paypalPlanId on this plan.`
      );
    }

    const token = await this.getAccessToken();

    const body = {
      plan_id: paypalPlanId,
      custom_id: context.organizationId,
      subscriber: context.userEmail ? { email_address: context.userEmail } : undefined,
      application_context: {
        brand_name: 'Glondia',
        locale: 'en-US',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        return_url: `${this.frontendUrl}/billing?pp=success&plan=${planKey}`,
        cancel_url: `${this.frontendUrl}/billing?pp=cancelled`,
      },
    };

    const res = await fetch(`${this.baseUrl}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`PayPal createSubscription failed: ${err}`);
      throw new BadRequestException('Failed to create PayPal subscription. Please try again.');
    }

    const subscription = await res.json() as PayPalSubscription;
    const approvalUrl = subscription.links.find((l) => l.rel === 'approve')?.href;

    if (!approvalUrl) {
      throw new BadRequestException('PayPal did not return an approval URL.');
    }

    this.logger.log(`PayPal subscription created: ${subscription.id} for org ${context.organizationId}`);
    return { approvalUrl };
  }

  /**
   * Called after PayPal redirects back with ?subscription_id=xxx&ba_token=xxx.
   * Activates the subscription in our DB.
   */
  async captureSubscription(subscriptionId: string, planKey: string, context: ActorContext) {
    this.assertEnabled();

    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/v1/billing/subscriptions/${subscriptionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new BadRequestException('Could not retrieve PayPal subscription details.');
    }

    const subscription = await res.json() as PayPalSubscription;
    const plan = await this.billingRepository.findPlanByKey(planKey);
    if (!plan) throw new NotFoundException(`Plan "${planKey}" not found.`);

    await this.billingRepository.upsertSubscription({
      organizationId: context.organizationId,
      planId: plan.id,
      provider: 'paypal',
      providerSubscriptionId: subscription.id,
      status: subscription.status === 'ACTIVE' ? 'active' : 'pending',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      cancelAtPeriodEnd: false,
    });

    this.logger.log(`PayPal subscription activated: ${subscription.id}`);
    return { status: subscription.status };
  }

  /**
   * Handles incoming PayPal webhook events.
   * Verifies the signature then updates subscription/invoice records.
   */
  async handleWebhook(headers: Record<string, string>, rawBody: Buffer) {
    if (!this.enabled) return { received: false };

    await this.verifyWebhookSignature(headers, rawBody);

    const event = JSON.parse(rawBody.toString()) as PayPalWebhookEvent;
    this.logger.log(`PayPal webhook: ${event.event_type}`);

    switch (event.event_type) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
      case 'BILLING.SUBSCRIPTION.UPDATED':
        await this.handleSubscriptionActivated(event);
        break;
      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.EXPIRED':
        await this.handleSubscriptionCancelled(event);
        break;
      case 'PAYMENT.SALE.COMPLETED':
        await this.handlePaymentCompleted(event);
        break;
      default:
        this.logger.debug(`Unhandled PayPal event: ${event.event_type}`);
    }

    return { received: true };
  }

  // ─── Webhook handlers ─────────────────────────────────────────────────────────

  private async handleSubscriptionActivated(event: PayPalWebhookEvent) {
    const { id, status, custom_id: organizationId } = event.resource;
    if (!organizationId) return;

    const existing = await this.billingRepository.findSubscriptionByProviderId(id);
    if (existing) {
      await this.billingRepository.updateSubscription(existing.id, {
        status: status === 'ACTIVE' ? 'active' : 'pending',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      });
    }
  }

  private async handleSubscriptionCancelled(event: PayPalWebhookEvent) {
    const { id } = event.resource;
    const existing = await this.billingRepository.findSubscriptionByProviderId(id);
    if (existing) {
      await this.billingRepository.updateSubscription(existing.id, {
        status: 'cancelled',
        cancelAtPeriodEnd: false,
      });
    }
  }

  private async handlePaymentCompleted(event: PayPalWebhookEvent) {
    const { id, custom_id: organizationId } = event.resource;
    if (!organizationId) return;

    const billing = event.resource.billing_info;
    const lastPayment = billing?.last_payment;
    if (!lastPayment) return;

    await this.billingRepository.createInvoice({
      organizationId,
      providerInvoiceId: id,
      status: 'paid',
      amountCents: Math.round(parseFloat(lastPayment.amount.value) * 100),
      currency: lastPayment.amount.currency_code,
      paidAt: new Date(lastPayment.time),
    });
  }

  // ─── PayPal REST helpers ──────────────────────────────────────────────────────

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiry) {
      return this.cachedToken;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) {
      throw new BadRequestException('Failed to authenticate with PayPal.');
    }

    const data = await res.json() as PayPalTokenResponse;
    this.cachedToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // 1-min buffer
    return this.cachedToken;
  }

  private async verifyWebhookSignature(headers: Record<string, string>, rawBody: Buffer) {
    if (!this.webhookId) {
      this.logger.warn('PAYPAL_WEBHOOK_ID not set — skipping webhook signature verification.');
      return;
    }

    const token = await this.getAccessToken();
    const verifyBody = {
      auth_algo:         headers['paypal-auth-algo'],
      cert_url:          headers['paypal-cert-url'],
      transmission_id:   headers['paypal-transmission-id'],
      transmission_sig:  headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id:        this.webhookId,
      webhook_event:     JSON.parse(rawBody.toString()),
    };

    const res = await fetch(`${this.baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(verifyBody),
    });

    if (!res.ok) {
      throw new BadRequestException('PayPal webhook signature verification request failed.');
    }

    const result = await res.json() as { verification_status: string };
    if (result.verification_status !== 'SUCCESS') {
      throw new BadRequestException('PayPal webhook signature invalid.');
    }
  }

  private assertEnabled() {
    if (!this.enabled) {
      throw new BadRequestException('PayPal is not configured on this instance.');
    }
  }
}
