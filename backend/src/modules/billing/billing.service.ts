import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { jsonFromDb } from '../../common/json-field';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { BillingRepository } from './billing.repository';

interface ActorContext {
  userId: string;
  organizationId: string;
  userEmail?: string;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe | null;
  private readonly frontendUrl: string;

  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly config: ConfigService
  ) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY', '');
    this.frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:5173');

    if (secretKey && secretKey !== 'sk_test_placeholder') {
      this.stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });
    } else {
      this.stripe = null;
      this.logger.warn('Stripe not configured — billing features will be limited.');
    }
  }

  async getSummary(context: ActorContext) {
    const [subscription, invoices, usageRecords, counts] = await Promise.all([
      this.billingRepository.findCurrentSubscription(context.organizationId),
      this.billingRepository.listInvoices(context.organizationId),
      this.billingRepository.listUsage(context.organizationId),
      this.billingRepository.getWorkspaceCounts(context.organizationId)
    ]);

    const plan = subscription?.plan ?? {
      key: 'free',
      name: 'Free',
      priceMonthlyCents: 0,
      limits: { projects: 3, teamMembers: 1, buildMinutesPerMonth: 300, bandwidthGbPerMonth: 10 },
      features: {}
    };

    const limits = jsonFromDb<Record<string, unknown>>((plan as { limits?: unknown }).limits, {});

    return {
      subscription: {
        id: subscription?.id ?? null,
        status: subscription?.status ?? 'active',
        currentPeriodStart: subscription?.currentPeriodStart ?? null,
        currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
        plan
      },
      invoices,
      usage: this.buildUsage(usageRecords, limits, counts),
      paymentMethod: null
    };
  }

  async createCheckout(dto: CreateCheckoutDto, context: ActorContext) {
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured on this instance.');
    }

    const plan = await this.billingRepository.findPlanByKey(dto.planKey);
    if (!plan || !plan.isActive) {
      throw new NotFoundException(`Plan "${dto.planKey}" not found.`);
    }

    const org = await this.billingRepository.findOrganizationById(context.organizationId);
    if (!org) throw new NotFoundException('Organization not found.');

    // Get or create Stripe customer
    let customerId = (org as { stripeCustomerId?: string }).stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: context.userEmail,
        metadata: { organizationId: context.organizationId }
      });
      customerId = customer.id;
      await this.billingRepository.updateOrganizationStripeCustomerId(context.organizationId, customerId);
    }

    const priceId = dto.interval === 'year'
      ? (plan as { stripePriceIdYearly?: string }).stripePriceIdYearly
      : (plan as { stripePriceIdMonthly?: string }).stripePriceIdMonthly;

    if (!priceId) {
      throw new BadRequestException(`Plan "${dto.planKey}" does not have a Stripe price configured for interval "${dto.interval ?? 'month'}".`);
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.frontendUrl}/billing?checkout=success`,
      cancel_url: `${this.frontendUrl}/billing?checkout=cancelled`,
      metadata: { organizationId: context.organizationId, planKey: dto.planKey }
    });

    return { url: session.url };
  }

  async createPortalSession(context: ActorContext) {
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured on this instance.');
    }

    const org = await this.billingRepository.findOrganizationById(context.organizationId);
    const customerId = (org as { stripeCustomerId?: string }).stripeCustomerId;

    if (!customerId) {
      throw new BadRequestException('No Stripe customer associated with this organization. Please create a subscription first.');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${this.frontendUrl}/billing`
    });

    return { url: session.url };
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    if (!this.stripe) return;

    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET', '');
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      throw new BadRequestException(`Webhook signature verification failed: ${(err as Error).message}`);
    }

    this.logger.log(`Stripe webhook: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }
  }

  // ─── Webhook handlers ────────────────────────────────────────────────────────

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const organizationId = session.metadata?.organizationId;
    const planKey = session.metadata?.planKey;
    if (!organizationId || !planKey || !session.subscription) return;

    const plan = await this.billingRepository.findPlanByKey(planKey);
    if (!plan) return;

    const subscription = await this.stripe!.subscriptions.retrieve(session.subscription as string);

    await this.billingRepository.upsertSubscription({
      organizationId,
      planId: plan.id,
      provider: 'stripe',
      providerSubscriptionId: subscription.id,
      status: 'active',
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    });
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const existing = await this.billingRepository.findSubscriptionByProviderId(subscription.id);
    if (!existing) return;

    await this.billingRepository.updateSubscription(existing.id, {
      status: this.mapStripeStatus(subscription.status),
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    });
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice) {
    const organizationId = await this.billingRepository.findOrgByStripeCustomer(invoice.customer as string);
    if (!organizationId) return;

    await this.billingRepository.createInvoice({
      organizationId,
      providerInvoiceId: invoice.id,
      status: 'paid',
      amountCents: invoice.amount_paid,
      currency: invoice.currency.toUpperCase(),
      paidAt: invoice.status_transitions.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : new Date()
    });
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    const organizationId = await this.billingRepository.findOrgByStripeCustomer(invoice.customer as string);
    if (!organizationId) return;

    await this.billingRepository.createInvoice({
      organizationId,
      providerInvoiceId: invoice.id,
      // 'uncollectible' is the closest InvoiceStatus value for a payment failure.
      status: 'uncollectible',
      amountCents: invoice.amount_due,
      currency: invoice.currency.toUpperCase()
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private mapStripeStatus(status: Stripe.Subscription.Status): string {
    const map: Record<string, string> = {
      trialing: 'trialing',
      active: 'active',
      past_due: 'past_due',
      canceled: 'cancelled',
      unpaid: 'unpaid',
      paused: 'paused',
      incomplete: 'past_due',
      incomplete_expired: 'cancelled'
    };
    return map[status] ?? 'active';
  }

  private buildUsage(
    usageRecords: Array<{ metricKey: string; quantity: number }>,
    limits: Record<string, unknown>,
    counts: { projects: number; teamMembers: number }
  ) {
    const aggregated = new Map<string, number>();
    for (const r of usageRecords) {
      aggregated.set(r.metricKey, (aggregated.get(r.metricKey) ?? 0) + r.quantity);
    }

    return [
      { metric: 'build_minutes', value: aggregated.get('build_minutes') ?? 0, limit: limits.buildMinutesPerMonth ?? -1 },
      { metric: 'bandwidth_gb', value: aggregated.get('bandwidth_gb') ?? 0, limit: limits.bandwidthGbPerMonth ?? -1 },
      { metric: 'projects', value: counts.projects, limit: limits.projects ?? -1 },
      { metric: 'team_members', value: counts.teamMembers, limit: limits.teamMembers ?? -1 }
    ];
  }
}
