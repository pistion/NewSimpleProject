import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../../database/prisma.service';
import { VultrService } from '../../integrations/vultr/vultr.service';
import { StatusGateway } from '../../gateways/status.gateway';
import { VpsQueueService, VpsProvisionPayload, VpsRefundPayload } from '../queues/vps-queue.service';
import { VPS_QUEUE, VPS_PROVISION_JOB, VPS_REFUND_JOB } from '../queues/queue.constants';

@Injectable()
export class VpsProvisioningProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VpsProvisioningProcessor.name);
  private worker?: Worker;
  private connection?: IORedis;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly vultr: VultrService,
    private readonly vpsQueue: VpsQueueService,
    private readonly statusGateway: StatusGateway
  ) {}

  onModuleInit() {
    if (this.config.get<string>('NODE_ENV') === 'test') return;

    this.connection = new IORedis(this.config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null
    });

    this.worker = new Worker(VPS_QUEUE, (job) => this.dispatch(job), {
      connection: this.connection,
      concurrency: 3
    });

    this.worker.on('failed', (job, err) =>
      this.logger.error(`VPS job ${job?.id} failed: ${err.message}`)
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.connection?.disconnect();
  }

  // ─── Dispatcher ───────────────────────────────────────────────────────────────

  private async dispatch(job: Job) {
    switch (job.name) {
      case VPS_PROVISION_JOB:
        return this.provision(job as Job<VpsProvisionPayload>);
      case VPS_REFUND_JOB:
        return this.refund(job as Job<VpsRefundPayload>);
    }
  }

  // ─── VPS Provisioning ─────────────────────────────────────────────────────────

  private async provision(job: Job<VpsProvisionPayload>) {
    const { vpsServiceId, organizationId, userId, provisionDetails } = job.data;

    const record = await this.prisma.vpsService.findFirst({
      where: { id: vpsServiceId, organizationId }
    });
    if (!record || record.status !== 'pending') {
      this.logger.warn(`VPS ${vpsServiceId} not in pending state — skipping.`);
      return;
    }

    // Transition to provisioning
    await this.prisma.vpsService.update({
      where: { id: vpsServiceId },
      data: { status: 'provisioning' }
    });
    this.statusGateway.emitVpsUpdate(organizationId, { id: vpsServiceId, status: 'provisioning' });

    // Register SSH key if needed
    let resolvedSshKeyId = provisionDetails.sshKeyId;
    if (provisionDetails.sshPublicKey) {
      try {
        const keyName = provisionDetails.sshKeyName || `glondia-${provisionDetails.label}`;
        const newKey = await this.vultr.createSshKey(keyName, provisionDetails.sshPublicKey);
        resolvedSshKeyId = newKey.id;
      } catch (err: unknown) {
        this.logger.warn(`SSH key creation failed, continuing: ${err instanceof Error ? err.message : err}`);
      }
    }

    try {
      const instance = await this.vultr.createInstance({
        region: provisionDetails.region,
        plan: provisionDetails.plan,
        os_id: provisionDetails.osId,
        label: provisionDetails.label,
        hostname: provisionDetails.hostname,
        ...(resolvedSshKeyId ? { sshkey_id: [resolvedSshKeyId] } : {}),
        ...(provisionDetails.userData
          ? { user_data: Buffer.from(provisionDetails.userData).toString('base64') }
          : {}),
        ...(provisionDetails.enableIpv6 ? { enable_ipv6: true } : {}),
        ...(provisionDetails.backups ? { backups: 'enabled' } : {}),
        ...(provisionDetails.ddosProtection ? { ddos_protection: true } : {}),
        tags: [`org:${organizationId}`]
      });

      await this.prisma.vpsService.update({
        where: { id: vpsServiceId },
        data: {
          providerInstanceId: instance.id,
          status: instance.status ?? 'active',
          mainIp: instance.main_ip,
          vcpuCount: instance.vcpu_count,
          ramMb: instance.ram,
          diskGb: instance.disk
        }
      });

      await this.logAction(vpsServiceId, organizationId, userId, 'provision', 'success', {
        instanceId: instance.id
      });

      this.statusGateway.emitVpsUpdate(organizationId, {
        id: vpsServiceId,
        status: instance.status ?? 'active',
        mainIp: instance.main_ip
      });

      this.logger.log(`VPS ${vpsServiceId} provisioned: Vultr instance ${instance.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown provisioning error';
      this.logger.error(`VPS ${vpsServiceId} provisioning failed: ${msg}`);

      await this.prisma.vpsService.update({
        where: { id: vpsServiceId },
        data: { status: 'error', metadata: { error: msg } }
      });

      await this.logAction(vpsServiceId, organizationId, userId, 'provision', 'error', {
        error: msg
      });

      this.statusGateway.emitVpsUpdate(organizationId, { id: vpsServiceId, status: 'error' });

      // Enqueue refund if payment was captured
      if (record.paypalOrderId && record.paypalCaptureId) {
        await this.vpsQueue.enqueueRefund({
          version: 1,
          vpsServiceId,
          organizationId,
          paypalOrderId: record.paypalOrderId,
          reason: `Provisioning failed: ${msg}`
        });
      }

      throw err;
    }
  }

  // ─── PayPal Refund ────────────────────────────────────────────────────────────

  private async refund(job: Job<VpsRefundPayload>) {
    const { vpsServiceId, organizationId, paypalOrderId, reason } = job.data;

    const record = await this.prisma.vpsService.findFirst({
      where: { id: vpsServiceId, organizationId }
    });
    if (!record) return;

    this.logger.log(`Initiating PayPal refund for VPS ${vpsServiceId}, order ${paypalOrderId}`);

    const token = await this.getPayPalToken();
    if (!token) {
      throw new Error('PayPal not configured — cannot issue refund automatically.');
    }

    // Find the capture ID to refund
    const captureId = record.paypalCaptureId;
    if (!captureId) {
      this.logger.warn(`VPS ${vpsServiceId} has no capture ID — manual refund needed for order ${paypalOrderId}`);
      return;
    }

    const sandbox = this.config.get<string>('PAYPAL_SANDBOX', 'true') !== 'false';
    const baseUrl = sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

    const res = await fetch(`${baseUrl}/v2/payments/captures/${captureId}/refund`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ note_to_payer: `Automatic refund: ${reason}` })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`PayPal refund failed for capture ${captureId}: ${err}`);
    }

    const refund = await res.json() as { id: string; status: string };
    this.logger.log(`PayPal refund ${refund.id} issued for VPS ${vpsServiceId}: ${refund.status}`);

    await this.prisma.vpsService.update({
      where: { id: vpsServiceId },
      data: { paymentStatus: 'refunded', metadata: { refundId: refund.id, reason } }
    });

    this.statusGateway.emitVpsUpdate(organizationId, {
      id: vpsServiceId,
      paymentStatus: 'refunded'
    });
  }

  private async getPayPalToken(): Promise<string | null> {
    const clientId = this.config.get<string>('PAYPAL_CLIENT_ID', '');
    const secret = this.config.get<string>('PAYPAL_CLIENT_SECRET', '');
    if (!clientId || !secret) return null;

    const sandbox = this.config.get<string>('PAYPAL_SANDBOX', 'true') !== 'false';
    const baseUrl = sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

    const creds = Buffer.from(`${clientId}:${secret}`).toString('base64');
    const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials'
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token: string };
    return data.access_token;
  }

  private async logAction(
    vpsServiceId: string,
    organizationId: string,
    actorUserId: string,
    action: string,
    status: string,
    request: object
  ) {
    try {
      await this.prisma.vpsActionLog.create({
        data: { vpsServiceId, organizationId, actorUserId, action, status, request, response: {} }
      });
    } catch (err) {
      this.logger.warn(`Failed to write VPS action log: ${err}`);
    }
  }
}
