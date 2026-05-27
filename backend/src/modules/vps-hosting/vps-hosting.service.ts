import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { VultrService } from '../../integrations/vultr/vultr.service';
import { VpsQueueService } from '../../workers/queues/vps-queue.service';
import { PricingService } from '../pricing/pricing.service';
import { CreateVpsDto } from './dto/create-vps.dto';
import { VpsQuoteDto } from './dto/vps-quote.dto';
import { CaptureVpsPayPalDto } from './dto/capture-paypal.dto';
import { ResizeVpsDto } from './dto/resize-vps.dto';
import { ReinstallVpsDto } from './dto/reinstall-vps.dto';
import { CreateSnapshotDto } from './dto/create-snapshot.dto';
import { RestoreSnapshotDto } from './dto/restore-snapshot.dto';
import { SetBackupScheduleDto } from './dto/set-backup-schedule.dto';

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
  private readonly frontendUrl: string;

  private cachedPaypalToken: string | null = null;
  private paypalTokenExpiry = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vultr: VultrService,
    private readonly vpsQueue: VpsQueueService,
    private readonly pricing: PricingService,
    private readonly config: ConfigService,
  ) {
    this.paypalClientId     = this.config.get<string>('PAYPAL_CLIENT_ID', '');
    this.paypalClientSecret = this.config.get<string>('PAYPAL_CLIENT_SECRET', '');
    this.paypalEnabled      = Boolean(this.paypalClientId && this.paypalClientSecret);
    this.frontendUrl        = this.config.get<string>('FRONTEND_URL', 'http://localhost:5173');

    const sandbox = this.config.get<string>('PAYPAL_SANDBOX', 'true') !== 'false';
    this.paypalBaseUrl = sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  }

  // ─── Catalog / configuration ──────────────────────────────────────────────────

  getSettings() {
    const sandbox = this.config.get<string>('PAYPAL_SANDBOX', 'true') !== 'false';
    return {
      vultrConfigured:  this.vultr.isConfigured(),
      paypalConfigured: this.paypalEnabled,
      markupPercent:    this.pricing.getVpsMarkup(),
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

    const markup = this.pricing.getVpsMarkup();
    const baseCostCents  = Math.round(plan.monthly_cost * 100);
    const markupCents    = Math.round(baseCostCents * (markup / 100));
    const totalCents     = baseCostCents + markupCents;

    return {
      plan:              plan.id,
      region:            dto.region,
      osId:              dto.osId,
      baseMonthlyCostCents:  baseCostCents,
      markupPercent:         markup,
      markupAmountCents:     markupCents,
      totalMonthlyCostCents: totalCents,
      currency:              'USD',
      breakdown: {
        vpsPrice:    `$${(baseCostCents / 100).toFixed(2)}`,
        platformFee: `$${(markupCents / 100).toFixed(2)}`,
        total:       `$${(totalCents / 100).toFixed(2)}`,
      },
    };
  }

  // ─── Direct deploy (usage-billed) ────────────────────────────────────────────
  // Provisions a VPS immediately. No upfront payment — usage is tracked and
  // billed at the end of the billing period (monthly).

  async deployVps(dto: CreateVpsDto, actor: ActorContext) {
    const plans = await this.vultr.listPlans();
    const plan = plans.find((p: { id: string }) => p.id === dto.plan);
    if (!plan) throw new NotFoundException(`Plan "${dto.plan}" not found.`);

    const markup        = this.pricing.getVpsMarkup();
    const baseCostCents = Math.round(plan.monthly_cost * 100);
    const markupCents   = Math.round(baseCostCents * (markup / 100));
    const totalCents    = baseCostCents + markupCents;

    const vpsRecord = await this.prisma.vpsService.create({
      data: {
        organizationId:    actor.organizationId,
        createdByUserId:   actor.userId,
        providerInstanceId: 'pending',
        label:             dto.label,
        hostname:          dto.hostname ?? dto.label,
        region:            dto.region,
        plan:              dto.plan,
        osId:              dto.osId,
        status:            'pending',
        monthlyCostCents:  baseCostCents,
        markupPercent:     markup,
        markupAmountCents: markupCents,
        totalPriceCents:   totalCents,
        paymentStatus:     'active',
        metadata:          { billingModel: 'usage' }
      }
    });

    await this.vpsQueue.enqueueProvision({
      version: 1,
      vpsServiceId: vpsRecord.id,
      organizationId: actor.organizationId,
      userId: actor.userId,
      provisionDetails: {
        region:         dto.region,
        plan:           dto.plan,
        osId:           dto.osId,
        label:          dto.label,
        hostname:       dto.hostname ?? dto.label,
        sshKeyId:       dto.sshKeyId,
        sshPublicKey:   dto.sshPublicKey,
        sshKeyName:     dto.sshKeyName,
        userData:       dto.userData,
        enableIpv6:     dto.enableIpv6,
        backups:        dto.backups,
        ddosProtection: dto.ddosProtection
      }
    });

    this.logger.log(`VPS ${vpsRecord.id} deployed for org ${actor.organizationId} — usage billing active`);
    return this.serializeVps(vpsRecord);
  }

  // ─── PayPal order (legacy — kept for prepay/invoice workflows) ────────────────

  async createPayPalOrder(dto: CreateVpsDto, actor: ActorContext) {
    if (!this.paypalEnabled) throw new BadRequestException('PayPal is not configured.');

    const quote = await this.getQuote({ region: dto.region, plan: dto.plan, osId: dto.osId });
    const totalAmount = (quote.totalMonthlyCostCents / 100).toFixed(2);
    const token = await this.getPayPalAccessToken();

    const orderBody = {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: `vps-${actor.organizationId}-${Date.now()}`,
        description: `Glondia VPS – ${dto.label} (${dto.region} / ${dto.plan})`,
        amount: {
          currency_code: 'USD',
          value: totalAmount,
          breakdown: { item_total: { currency_code: 'USD', value: totalAmount } }
        },
        items: [{
          name: `VPS Server — ${dto.label}`,
          description: `Region: ${dto.region} | Plan: ${dto.plan}`,
          quantity: '1',
          unit_amount: { currency_code: 'USD', value: totalAmount },
          category: 'DIGITAL_GOODS'
        }]
      }],
      application_context: {
        brand_name: 'Glondia',
        locale: 'en-US',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        return_url: `${this.frontendUrl}/dashboard/hosting?vps=success`,
        cancel_url: `${this.frontendUrl}/dashboard/hosting?vps=cancelled`
      }
    };

    const res = await fetch(`${this.paypalBaseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(orderBody)
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`PayPal createOrder failed: ${err}`);
      throw new BadRequestException('Failed to create PayPal order. Please try again.');
    }

    const order = await res.json() as PayPalOrderResponse;
    const approvalUrl = order.links.find((l) => l.rel === 'approve')?.href;
    this.logger.log(`PayPal VPS order created: ${order.id} for org ${actor.organizationId}`);

    return { orderId: order.id, approvalUrl, quote, provisionDetails: dto };
  }

  // ─── PayPal capture → record + enqueue (idempotent) ──────────────────────────

  async capturePayPalOrder(dto: CaptureVpsPayPalDto, provisionDetails: CreateVpsDto, actor: ActorContext) {
    if (!this.paypalEnabled) throw new BadRequestException('PayPal is not configured.');

    // Idempotency guard
    const existing = await this.prisma.vpsService.findFirst({
      where: { organizationId: actor.organizationId, paypalOrderId: dto.orderId, deletedAt: null }
    });
    if (existing) {
      this.logger.log(`Duplicate capture for order ${dto.orderId} — returning existing VPS ${existing.id}`);
      return this.serializeVps(existing);
    }

    const token = await this.getPayPalAccessToken();
    const res = await fetch(`${this.paypalBaseUrl}/v2/checkout/orders/${dto.orderId}/capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
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

    const markup = this.pricing.getVpsMarkup();
    const plans = await this.vultr.listPlans();
    const plan = plans.find((p: { id: string }) => p.id === provisionDetails.plan);
    if (!plan) throw new NotFoundException(`Plan "${provisionDetails.plan}" not found.`);

    const baseCostCents  = Math.round(plan.monthly_cost * 100);
    const markupCents    = Math.round(baseCostCents * (markup / 100));
    const totalCents     = baseCostCents + markupCents;

    // Create record in pending state — worker provisions asynchronously
    const vpsRecord = await this.prisma.vpsService.create({
      data: {
        organizationId:    actor.organizationId,
        createdByUserId:   actor.userId,
        providerInstanceId: 'pending',
        label:             provisionDetails.label,
        hostname:          provisionDetails.hostname ?? provisionDetails.label,
        region:            provisionDetails.region,
        plan:              provisionDetails.plan,
        osId:              provisionDetails.osId,
        status:            'pending',
        monthlyCostCents:  baseCostCents,
        markupPercent:     markup,
        markupAmountCents: markupCents,
        totalPriceCents:   totalCents,
        paypalOrderId:     dto.orderId,
        paypalCaptureId:   captureRecord.id,
        paymentStatus:     'completed',
        metadata:          { captureId: captureRecord.id }
      }
    });

    await this.vpsQueue.enqueueProvision({
      version: 1,
      vpsServiceId: vpsRecord.id,
      organizationId: actor.organizationId,
      userId: actor.userId,
      provisionDetails: {
        region:         provisionDetails.region,
        plan:           provisionDetails.plan,
        osId:           provisionDetails.osId,
        label:          provisionDetails.label,
        hostname:       provisionDetails.hostname ?? provisionDetails.label,
        sshKeyId:       provisionDetails.sshKeyId,
        sshPublicKey:   provisionDetails.sshPublicKey,
        sshKeyName:     provisionDetails.sshKeyName,
        userData:       provisionDetails.userData,
        enableIpv6:     provisionDetails.enableIpv6,
        backups:        provisionDetails.backups,
        ddosProtection: provisionDetails.ddosProtection
      }
    });

    this.logger.log(`VPS ${vpsRecord.id} created in pending state and queued for provisioning`);
    return this.serializeVps(vpsRecord);
  }

  // ─── List / get ───────────────────────────────────────────────────────────────

  async listServices(actor: ActorContext) {
    const records = await this.prisma.vpsService.findMany({
      where: { organizationId: actor.organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    // Sync live state from Vultr in a single batch call — never block on failure
    const destroyedIds = new Set<string>();

    // Build a mutable patch map so we don't mutate Prisma result types
    const patches = new Map<string, Partial<{
      status: string; mainIp: string | null; vcpuCount: number; ramMb: number; diskGb: number;
    }>>();

    try {
      const liveInstances = await this.vultr.listInstances();
      const liveMap = new Map(liveInstances.map((i) => [i.id, i]));

      const updates: Promise<unknown>[] = [];
      for (const record of records) {
        if (record.providerInstanceId === 'pending' || record.providerInstanceId === 'FAILED') continue;
        const live = liveMap.get(record.providerInstanceId);

        if (!live) {
          // Instance no longer exists on Vultr — soft-delete DB record
          if (record.status !== 'destroyed') {
            destroyedIds.add(record.id);
            updates.push(
              this.prisma.vpsService.update({
                where: { id: record.id },
                data: { status: 'destroyed', deletedAt: new Date() },
              })
            );
          }
          continue;
        }

        const needsUpdate =
          live.status  !== record.status  ||
          live.main_ip !== record.mainIp  ||
          (live.vcpu_count != null && live.vcpu_count !== record.vcpuCount) ||
          (live.ram       != null && live.ram        !== record.ramMb)      ||
          (live.disk      != null && live.disk       !== record.diskGb);

        if (needsUpdate) {
          patches.set(record.id, {
            status:    live.status,
            mainIp:    live.main_ip,
            vcpuCount: live.vcpu_count,
            ramMb:     live.ram,
            diskGb:    live.disk,
          });
          updates.push(
            this.prisma.vpsService.update({
              where: { id: record.id },
              data: {
                status:    live.status,
                mainIp:    live.main_ip,
                vcpuCount: live.vcpu_count,
                ramMb:     live.ram,
                diskGb:    live.disk,
              },
            })
          );
        }
      }

      if (updates.length) await Promise.allSettled(updates);
    } catch (err: unknown) {
      // Vultr unreachable — return cached DB data, don't fail the whole list
      this.logger.warn(`Vultr sync skipped during listServices: ${err instanceof Error ? err.message : err}`);
    }

    return records
      .filter((r) => !destroyedIds.has(r.id))
      .map((r) => {
        const patch = patches.get(r.id);
        return this.serializeVps(patch ? { ...r, ...patch } : r);
      });
  }

  async getService(id: string, actor: ActorContext) {
    const record = await this.requireOwned(id, actor);
    const provisionable = record.providerInstanceId !== 'pending' && record.providerInstanceId !== 'FAILED';
    if (provisionable) {
      try {
        const live = await this.vultr.getInstance(record.providerInstanceId);
        if (live.status !== record.status || live.main_ip !== record.mainIp) {
          await this.prisma.vpsService.update({
            where: { id },
            data: { status: live.status, mainIp: live.main_ip }
          });
          return this.serializeVps({ ...record, status: live.status, mainIp: live.main_ip });
        }
      } catch { /* Vultr unreachable — return cached record */ }
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
    const provisionable = record.providerInstanceId !== 'pending' && record.providerInstanceId !== 'FAILED';

    if (provisionable) {
      try {
        await this.vultr.deleteInstance(record.providerInstanceId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // 404 = already gone on Vultr side — that's fine, continue with DB cleanup
        // Any other error: log it but still soft-delete the DB record so the UI stays consistent
        this.logger.warn(`Vultr deleteInstance for ${record.providerInstanceId} failed (continuing DB cleanup): ${msg}`);
      }
    }

    await this.prisma.vpsService.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'destroyed' },
    });
    await this.logAction(id, actor.organizationId, actor.userId, 'destroy', 'success', {});
    return { ok: true };
  }

  // ─── Resize (plan upgrade) ────────────────────────────────────────────────────

  async resizeService(id: string, dto: ResizeVpsDto, actor: ActorContext) {
    const record = await this.requireOwned(id, actor);
    this.requireProvisioned(record);

    const plans = await this.vultr.listPlans();
    const plan = plans.find((p: { id: string }) => p.id === dto.plan);
    if (!plan) throw new NotFoundException(`Plan "${dto.plan}" not found.`);

    await this.vultr.resizeInstance(record.providerInstanceId, dto.plan);

    const markup        = this.pricing.getVpsMarkup();
    const baseCostCents = Math.round(plan.monthly_cost * 100);
    const markupCents   = Math.round(baseCostCents * (markup / 100));
    const totalCents    = baseCostCents + markupCents;

    const updated = await this.prisma.vpsService.update({
      where: { id },
      data: { plan: dto.plan, monthlyCostCents: baseCostCents, markupAmountCents: markupCents, totalPriceCents: totalCents },
    });

    await this.logAction(id, actor.organizationId, actor.userId, 'resize', 'success', { plan: dto.plan });
    return this.serializeVps(updated);
  }

  // ─── Reinstall ────────────────────────────────────────────────────────────────

  async reinstallService(id: string, _dto: ReinstallVpsDto, actor: ActorContext) {
    const record = await this.requireOwned(id, actor);
    this.requireProvisioned(record);
    await this.vultr.reinstallInstance(record.providerInstanceId, record.hostname);
    await this.logAction(id, actor.organizationId, actor.userId, 'reinstall', 'success', {});
    return { ok: true };
  }

  // ─── SSH keys ─────────────────────────────────────────────────────────────────

  async listSshKeys() {
    return this.vultr.listSshKeys();
  }

  async deleteSshKey(keyId: string) {
    await this.vultr.deleteSshKey(keyId);
    return { ok: true };
  }

  // ─── Bandwidth ────────────────────────────────────────────────────────────────

  async getBandwidth(id: string, actor: ActorContext) {
    const record = await this.requireOwned(id, actor);
    this.requireProvisioned(record);
    return this.vultr.getInstanceBandwidth(record.providerInstanceId);
  }

  // ─── Snapshots ────────────────────────────────────────────────────────────────

  async listSnapshots() {
    return this.vultr.listSnapshots();
  }

  async createSnapshot(id: string, dto: CreateSnapshotDto, actor: ActorContext) {
    const record = await this.requireOwned(id, actor);
    this.requireProvisioned(record);
    const snapshot = await this.vultr.createSnapshot(record.providerInstanceId, dto.description);
    await this.logAction(id, actor.organizationId, actor.userId, 'snapshot-create', 'success', { snapshotId: snapshot.id });
    return snapshot;
  }

  async deleteSnapshot(snapshotId: string) {
    await this.vultr.deleteSnapshot(snapshotId);
    return { ok: true };
  }

  async restoreFromSnapshot(id: string, dto: RestoreSnapshotDto, actor: ActorContext) {
    const record = await this.requireOwned(id, actor);
    this.requireProvisioned(record);
    await this.vultr.restoreInstance(record.providerInstanceId, dto.snapshotId);
    await this.logAction(id, actor.organizationId, actor.userId, 'restore', 'success', { snapshotId: dto.snapshotId });
    return { ok: true };
  }

  // ─── Backup schedule ──────────────────────────────────────────────────────────

  async getBackupSchedule(id: string, actor: ActorContext) {
    const record = await this.requireOwned(id, actor);
    this.requireProvisioned(record);
    return this.vultr.getBackupSchedule(record.providerInstanceId);
  }

  async setBackupSchedule(id: string, dto: SetBackupScheduleDto, actor: ActorContext) {
    const record = await this.requireOwned(id, actor);
    this.requireProvisioned(record);
    await this.vultr.setBackupSchedule(record.providerInstanceId, {
      type: dto.type,
      hour: dto.hour,
      dow: dto.dow,
      dom: dto.dom,
    });
    await this.logAction(id, actor.organizationId, actor.userId, 'backup-schedule-set', 'success', { type: dto.type });
    return { ok: true };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async requireOwned(id: string, actor: ActorContext) {
    const record = await this.prisma.vpsService.findFirst({ where: { id, deletedAt: null } });
    if (!record) throw new NotFoundException('VPS service not found.');
    if (record.organizationId !== actor.organizationId) throw new ForbiddenException('Access denied.');
    return record;
  }

  private requireProvisioned(record: { providerInstanceId: string }) {
    if (record.providerInstanceId === 'pending' || record.providerInstanceId === 'FAILED') {
      throw new BadRequestException('VPS is not yet provisioned. Please wait until the instance is active.');
    }
  }

  private serializeVps(record: {
    id: string; organizationId: string; providerInstanceId: string; label: string; hostname: string;
    region: string; plan: string; osId: number; status: string; mainIp: string | null;
    vcpuCount: number | null; ramMb: number | null; diskGb: number | null;
    monthlyCostCents: number; markupPercent: number; markupAmountCents: number; totalPriceCents: number;
    currency: string; paymentStatus: string; createdAt: Date; updatedAt: Date;
  }) {
    return {
      id: record.id, organizationId: record.organizationId,
      providerInstanceId: record.providerInstanceId, label: record.label, hostname: record.hostname,
      region: record.region, plan: record.plan, osId: record.osId, status: record.status,
      mainIp: record.mainIp, vcpuCount: record.vcpuCount, ramMb: record.ramMb, diskGb: record.diskGb,
      monthlyCostCents: record.monthlyCostCents, markupPercent: record.markupPercent,
      markupAmountCents: record.markupAmountCents, totalPriceCents: record.totalPriceCents,
      currency: record.currency, paymentStatus: record.paymentStatus,
      createdAt: record.createdAt, updatedAt: record.updatedAt
    };
  }

  private async logAction(
    vpsServiceId: string, organizationId: string, actorUserId: string | null,
    action: string, status: string, request: object
  ) {
    try {
      await this.prisma.vpsActionLog.create({
        data: { vpsServiceId, organizationId, actorUserId, action, status, request, response: {} }
      });
    } catch (err) {
      this.logger.warn(`Failed to write VPS action log: ${err}`);
    }
  }

  private async getPayPalAccessToken(): Promise<string> {
    if (this.cachedPaypalToken && Date.now() < this.paypalTokenExpiry) return this.cachedPaypalToken;
    const creds = Buffer.from(`${this.paypalClientId}:${this.paypalClientSecret}`).toString('base64');
    const res = await fetch(`${this.paypalBaseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials'
    });
    if (!res.ok) throw new BadRequestException('Failed to authenticate with PayPal.');
    const data = await res.json() as { access_token: string; expires_in: number };
    this.cachedPaypalToken = data.access_token;
    this.paypalTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.cachedPaypalToken;
  }
}
