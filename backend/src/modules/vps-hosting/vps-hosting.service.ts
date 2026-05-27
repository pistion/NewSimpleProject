import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { VultrService } from '../../integrations/vultr/vultr.service';
import { CreateVpsDto } from './dto/create-vps.dto';
import { VpsQuoteDto } from './dto/vps-quote.dto';
import { CaptureVpsPayPalDto } from './dto/capture-paypal.dto';

interface ActorContext {
  userId: string;
  organizationId: string;
}

interface PayPalOrderResponse {
  id: string;
  status: string;
  links: Array<{ href: string; rel: string; method: string }>;
}

interface PayPalCaptureResponse {
  id: string;
  status: string;
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{ id: string; status: string; amount: { value: string; currency_code: string } }>;
    };
  }>;
}

@Injectable()
export class VpsHostingService {
  private readonly logger = new Logger(VpsHostingService.name);
  private readonly paypalBaseUrl: string;
  private readonly paypalClientId: string;
  private readonly paypalClientSecret: string;
  private readonly paypalEnabled: boolean;
  private readonly markupPercent: number;
  private readonly frontendUrl: string;

  private cachedPaypalToken: string | null = null;
  private paypalTokenExpiry = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vultr: VultrService,
    private readonly config: ConfigService,
  ) {
    this.paypalClientId     = this.config.get<string>('PAYPAL_CLIENT_ID', '');
    this.paypalClientSecret = this.config.get<string>('PAYPAL_CLIENT_SECRET', '');
    this.paypalEnabled      = Boolean(this.paypalClientId && this.paypalClientSecret);
    this.frontendUrl        = this.config.get<string>('FRONTEND_URL', 'http://localhost:5173');
    this.markupPercent      = this.config.get<number>('PLATFORM_MARKUP_PERCENT', 30);

    const sandbox = this.config.get<string>('PAYPAL_SANDBOX', 'true') !== 'false';
    this.paypalBaseUrl = sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  }

  // ─── Catalog / configuration ──────────────────────────────────────────────────

  getSettings() {
    const sandbox = this.config.get<string>('PAYPAL_SANDBOX', 'true') !== 'false';
    return {
      vultrConfigured:  this.vultr.isConfigured(),
      paypalConfigured: this.paypalEnabled,
      markupPercent:    this.markupPercent,
      sandbox,
    };
  }

  async listRegions()           { return this.vultr.listRegions(); }
  async listPlans(type?: string){ return this.vultr.listPlans(type); }
  async listOs()                { return this.vultr.listOperatingSystems(); }

  // ─── Quote ────────────────────────────────────────────────────────────────────

  async getQuote(dto: VpsQuoteDto) {
    const plans = await this.vultr.listPlans();
    const plan = plans.find((p: { id: string }) => p.id === dto.plan);
    if (!plan) throw new NotFoundException(`Plan "${dto.plan}" not found.`);

    const markup = this.markupPercent;
    const baseCostCents    = Math.round(plan.monthly_cost * 100);
    const markupCents      = Math.round(baseCostCents * (markup / 100));
    const totalCents       = baseCostCents + markupCents;

    return {
      plan:              plan.id,
      region:            dto.region,
      osId:              dto.osId,
      baseMonthlyCostCents:    baseCostCents,
      markupPercent:           markup,
      markupAmountCents:       markupCents,
      totalMonthlyCostCents:   totalCents,
      currency:                'USD',
      breakdown: {
        vpsPrice:    `$${(baseCostCents / 100).toFixed(2)}`,
        platformFee: `$${(markupCents / 100).toFixed(2)}`,
        total:       `$${(totalCents / 100).toFixed(2)}`,
      },
    };
  }

  // ─── PayPal order ─────────────────────────────────────────────────────────────

  async createPayPalOrder(dto: CreateVpsDto, actor: ActorContext) {
    if (!this.paypalEnabled) {
      throw new BadRequestException('PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.');
    }

    const quote = await this.getQuote({ region: dto.region, plan: dto.plan, osId: dto.osId });
    const totalAmount = (quote.totalMonthlyCostCents / 100).toFixed(2);

    const token = await this.getPayPalAccessToken();
    const orderBody = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: `vps-${actor.organizationId}-${Date.now()}`,
          description: `Glondia VPS – ${dto.label} (${dto.region} / ${dto.plan})`,
          amount: {
            currency_code: 'USD',
            value: totalAmount,
            breakdown: {
              item_total: { currency_code: 'USD', value: totalAmount },
            },
          },
          items: [
            {
              name: `VPS Server — ${dto.label}`,
              description: `Region: ${dto.region} | Plan: ${dto.plan}`,
              quantity: '1',
              unit_amount: { currency_code: 'USD', value: totalAmount },
              category: 'DIGITAL_GOODS',
            },
          ],
        },
      ],
      application_context: {
        brand_name: 'Glondia',
        locale: 'en-US',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        return_url: `${this.frontendUrl}/dashboard/hosting?vps=success`,
        cancel_url: `${this.frontendUrl}/dashboard/hosting?vps=cancelled`,
      },
    };

    const res = await fetch(`${this.paypalBaseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(orderBody),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`PayPal createOrder failed: ${err}`);
      throw new BadRequestException('Failed to create PayPal order. Please try again.');
    }

    const order = await res.json() as PayPalOrderResponse;
    const approvalUrl = order.links.find((l) => l.rel === 'approve')?.href;

    this.logger.log(`PayPal VPS order created: ${order.id} for org ${actor.organizationId}`);

    return {
      orderId:     order.id,
      approvalUrl,
      quote,
      provisionDetails: dto,
    };
  }

  // ─── PayPal capture (idempotent) and provision ────────────────────────────────

  async capturePayPalOrder(dto: CaptureVpsPayPalDto, provisionDetails: CreateVpsDto, actor: ActorContext) {
    if (!this.paypalEnabled) {
      throw new BadRequestException('PayPal is not configured.');
    }

    // Idempotency — check if this order was already captured and a VPS already created
    const existing = await this.prisma.vpsService.findFirst({
      where: {
        organizationId: actor.organizationId,
        paypalOrderId:  dto.orderId,
        deletedAt:      null,
      },
    });
    if (existing) {
      this.logger.log(`Duplicate capture for order ${dto.orderId} — returning existing VPS ${existing.id}`);
      return this.serializeVps(existing);
    }

    // Capture the PayPal order
    const token = await this.getPayPalAccessToken();
    const res = await fetch(`${this.paypalBaseUrl}/v2/checkout/orders/${dto.orderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`PayPal capture failed for order ${dto.orderId}: ${err}`);
      throw new BadRequestException('PayPal payment capture failed. Please try again.');
    }

    const capture = await res.json() as PayPalCaptureResponse;
    const captureRecord = capture.purchase_units?.[0]?.payments?.captures?.[0];
    if (!captureRecord || captureRecord.status !== 'COMPLETED') {
      throw new BadRequestException(`Payment not completed. Status: ${captureRecord?.status ?? 'unknown'}`);
    }

    this.logger.log(`PayPal capture COMPLETED: orderId=${dto.orderId} captureId=${captureRecord.id}`);

    // Calculate pricing
    const plans = await this.vultr.listPlans();
    const plan = plans.find((p: { id: string }) => p.id === provisionDetails.plan);
    if (!plan) throw new NotFoundException(`Plan "${provisionDetails.plan}" not found.`);

    const markup = this.markupPercent;
    const baseCostCents   = Math.round(plan.monthly_cost * 100);
    const markupCents     = Math.round(baseCostCents * (markup / 100));
    const totalCents      = baseCostCents + markupCents;

    // Resolve OS name for display
    let osName: string | null = null;
    try {
      const osList = await this.vultr.listOperatingSystems();
      const osEntry = osList.find((o: { id: number }) => o.id === provisionDetails.osId);
      osName = (osEntry as { name?: string } | undefined)?.name ?? null;
    } catch { /* non-critical */ }

    // Register SSH key if a public key was pasted
    let resolvedSshKeyId = provisionDetails.sshKeyId;
    if (provisionDetails.sshPublicKey) {
      try {
        const keyName = provisionDetails.sshKeyName || `glondia-${provisionDetails.label}`;
        const newKey = await this.vultr.createSshKey(keyName, provisionDetails.sshPublicKey);
        resolvedSshKeyId = newKey.id;
      } catch (err: unknown) {
        this.logger.warn(`SSH key creation failed, continuing without: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Create the Vultr instance
    let vultrInstance: Awaited<ReturnType<VultrService['createInstance']>>;
    try {
      vultrInstance = await this.vultr.createInstance({
        region:   provisionDetails.region,
        plan:     provisionDetails.plan,
        os_id:    provisionDetails.osId,
        label:    provisionDetails.label,
        hostname: provisionDetails.hostname ?? provisionDetails.label,
        ...(resolvedSshKeyId ? { sshkey_id: [resolvedSshKeyId] } : {}),
        ...(provisionDetails.userData ? { user_data: Buffer.from(provisionDetails.userData).toString('base64') } : {}),
        ...(provisionDetails.enableIpv6  ? { enable_ipv6: true } : {}),
        ...(provisionDetails.backups     ? { backups: 'enabled' } : {}),
        ...(provisionDetails.ddosProtection ? { ddos_protection: true } : {}),
        tags: [`org:${actor.organizationId}`],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Vultr instance creation failed.';
      this.logger.error(`Vultr createInstance failed after PayPal capture: ${msg}`);
      // Store a failed record for support investigation
      await this.prisma.vpsService.create({
        data: {
          organizationId:    actor.organizationId,
          createdByUserId:   actor.userId,
          providerInstanceId: 'FAILED',
          label:             provisionDetails.label,
          hostname:          provisionDetails.hostname ?? provisionDetails.label,
          region:            provisionDetails.region,
          plan:              provisionDetails.plan,
          osId:              provisionDetails.osId,
          osName,
          status:            'error',
          monthlyCostCents:  baseCostCents,
          markupPercent:     markup,
          markupAmountCents: markupCents,
          totalPriceCents:   totalCents,
          paypalOrderId:     dto.orderId,
          paypalCaptureId:   captureRecord.id,
          paymentStatus:     'completed',
          metadata:          JSON.stringify({ error: msg }),
        },
      });
      throw new ConflictException(
        'Payment was captured but server provisioning failed. Our team has been notified. ' +
        'Please contact support@glondia.co with your order ID: ' + dto.orderId
      );
    }

    // Persist the VPS record
    const vpsRecord = await this.prisma.vpsService.create({
      data: {
        organizationId:    actor.organizationId,
        createdByUserId:   actor.userId,
        providerInstanceId: vultrInstance.id,
        label:             provisionDetails.label,
        hostname:          provisionDetails.hostname ?? provisionDetails.label,
        region:            provisionDetails.region,
        plan:              provisionDetails.plan,
        osId:              provisionDetails.osId,
        osName,
        status:            vultrInstance.status ?? 'pending',
        mainIp:            vultrInstance.main_ip,
        vcpuCount:         vultrInstance.vcpu_count,
        ramMb:             vultrInstance.ram,
        diskGb:            vultrInstance.disk,
        monthlyCostCents:  baseCostCents,
        markupPercent:     markup,
        markupAmountCents: markupCents,
        totalPriceCents:   totalCents,
        paypalOrderId:     dto.orderId,
        paypalCaptureId:   captureRecord.id,
        paymentStatus:     'completed',
        metadata:          JSON.stringify({ vultrId: vultrInstance.id }),
      },
    });

    await this.logAction(vpsRecord.id, actor.organizationId, actor.userId, 'create', 'success', provisionDetails);

    return this.serializeVps(vpsRecord);
  }

  // ─── List / get ───────────────────────────────────────────────────────────────

  async listServices(actor: ActorContext) {
    const records = await this.prisma.vpsService.findMany({
      where: { organizationId: actor.organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r: Parameters<typeof this.serializeVps>[0]) => this.serializeVps(r));
  }

  async getService(id: string, actor: ActorContext) {
    const record = await this.requireOwned(id, actor);
    // Refresh status from Vultr if not failed
    if (record.providerInstanceId !== 'FAILED') {
      try {
        const live = await this.vultr.getInstance(record.providerInstanceId);
        if (live.status !== record.status || live.main_ip !== record.mainIp) {
          await this.prisma.vpsService.update({
            where: { id },
            data: { status: live.status, mainIp: live.main_ip },
          });
          return this.serializeVps({ ...record, status: live.status, mainIp: live.main_ip });
        }
      } catch {
        // Vultr unreachable — return cached record
      }
    }
    return this.serializeVps(record);
  }

  // ─── Instance actions ─────────────────────────────────────────────────────────

  async startService(id: string, actor: ActorContext) {
    const record = await this.requireOwned(id, actor);
    await this.vultr.startInstance(record.providerInstanceId);
    await this.logAction(id, actor.organizationId, actor.userId, 'start', 'success', {});
    return { ok: true };
  }

  async haltService(id: string, actor: ActorContext) {
    const record = await this.requireOwned(id, actor);
    await this.vultr.haltInstance(record.providerInstanceId);
    await this.logAction(id, actor.organizationId, actor.userId, 'halt', 'success', {});
    return { ok: true };
  }

  async rebootService(id: string, actor: ActorContext) {
    const record = await this.requireOwned(id, actor);
    await this.vultr.rebootInstance(record.providerInstanceId);
    await this.logAction(id, actor.organizationId, actor.userId, 'reboot', 'success', {});
    return { ok: true };
  }

  async destroyService(id: string, actor: ActorContext) {
    const record = await this.requireOwned(id, actor);
    await this.vultr.deleteInstance(record.providerInstanceId);
    try {
      await this.prisma.vpsService.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'destroyed' },
      });
      await this.logAction(id, actor.organizationId, actor.userId, 'destroy', 'success', {});
    } catch (dbErr: unknown) {
      const msg = dbErr instanceof Error ? dbErr.message : 'DB update failed after destroy';
      this.logger.error(`Vultr instance ${record.providerInstanceId} destroyed but DB update failed: ${msg}`);
      try {
        await this.prisma.vpsService.update({
          where: { id },
          data: { status: 'error', metadata: JSON.stringify({ destroyError: msg }) },
        });
      } catch { /* best-effort */ }
      throw dbErr;
    }
    return { ok: true };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async requireOwned(id: string, actor: ActorContext) {
    const record = await this.prisma.vpsService.findFirst({
      where: { id, deletedAt: null },
    });
    if (!record) throw new NotFoundException('VPS service not found.');
    if (record.organizationId !== actor.organizationId) {
      throw new ForbiddenException('Access denied.');
    }
    return record;
  }

  private serializeVps(record: {
    id: string;
    organizationId: string;
    providerInstanceId: string;
    label: string;
    hostname: string;
    region: string;
    plan: string;
    osId: number;
    osName?: string | null;
    status: string;
    mainIp: string | null;
    vcpuCount: number | null;
    ramMb: number | null;
    diskGb: number | null;
    monthlyCostCents: number;
    markupPercent: number;
    markupAmountCents: number;
    totalPriceCents: number;
    currency: string;
    paymentStatus: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id:                   record.id,
      organizationId:       record.organizationId,
      providerInstanceId:   record.providerInstanceId,
      label:                record.label,
      hostname:             record.hostname,
      region:               record.region,
      plan:                 record.plan,
      osId:                 record.osId,
      osName:               record.osName ?? null,
      status:               record.status,
      mainIp:               record.mainIp,
      vcpuCount:            record.vcpuCount,
      ramMb:                record.ramMb,
      diskGb:               record.diskGb,
      monthlyCostCents:     record.monthlyCostCents,
      markupPercent:        record.markupPercent,
      markupAmountCents:    record.markupAmountCents,
      totalPriceCents:      record.totalPriceCents,
      currency:             record.currency,
      paymentStatus:        record.paymentStatus,
      createdAt:            record.createdAt,
      updatedAt:            record.updatedAt,
    };
  }

  private async logAction(
    vpsServiceId: string,
    organizationId: string,
    actorUserId: string | null,
    action: string,
    status: string,
    request: unknown,
  ) {
    try {
      await this.prisma.vpsActionLog.create({
        data: {
          vpsServiceId,
          organizationId,
          actorUserId,
          action,
          status,
          request:  JSON.stringify(request),
          response: JSON.stringify({}),
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to write VPS action log: ${err}`);
    }
  }

  private async getPayPalAccessToken(): Promise<string> {
    if (this.cachedPaypalToken && Date.now() < this.paypalTokenExpiry) {
      return this.cachedPaypalToken;
    }

    const creds = Buffer.from(`${this.paypalClientId}:${this.paypalClientSecret}`).toString('base64');
    const res = await fetch(`${this.paypalBaseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) {
      throw new BadRequestException('Failed to authenticate with PayPal.');
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    this.cachedPaypalToken = data.access_token;
    this.paypalTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.cachedPaypalToken;
  }
}
