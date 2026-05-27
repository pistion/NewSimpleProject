import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { VPS_QUEUE, VPS_PROVISION_JOB, VPS_REFUND_JOB } from './queue.constants';

export interface VpsProvisionPayload {
  version: 1;
  vpsServiceId: string;
  organizationId: string;
  userId: string;
  provisionDetails: {
    region: string;
    plan: string;
    osId: number;
    label: string;
    hostname: string;
    sshKeyId?: string;
    sshPublicKey?: string;
    sshKeyName?: string;
    userData?: string;
    enableIpv6?: boolean;
    backups?: boolean;
    ddosProtection?: boolean;
  };
}

export interface VpsRefundPayload {
  version: 1;
  vpsServiceId: string;
  organizationId: string;
  paypalOrderId: string;
  reason: string;
}

@Injectable()
export class VpsQueueService implements OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly queue: Queue;

  constructor(config: ConfigService) {
    this.connection = new IORedis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null
    });
    this.queue = new Queue(VPS_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 100,
        removeOnFail: 500
      }
    });
  }

  enqueueProvision(payload: VpsProvisionPayload) {
    return this.queue.add(VPS_PROVISION_JOB, payload, {
      jobId: `${VPS_PROVISION_JOB}:${payload.vpsServiceId}`
    });
  }

  enqueueRefund(payload: VpsRefundPayload) {
    return this.queue.add(VPS_REFUND_JOB, payload, {
      jobId: `${VPS_REFUND_JOB}:${payload.vpsServiceId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 }
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
    this.connection.disconnect();
  }
}
