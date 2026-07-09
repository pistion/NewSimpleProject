import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { REGISTRAR_QUEUE, REGISTRAR_REGISTER_DOMAIN_JOB } from './queue.constants';

export interface DomainRegistrationPayload {
  version: 1;
  domainId: string;
  organizationId: string;
  userId: string;
  hostname: string;
  contactId: string;
  years: number;
  autoRenew: boolean;
  privacyProtection: boolean;
  projectId?: string | null;
}

@Injectable()
export class RegistrarQueueService implements OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly queue: Queue;

  constructor(config: ConfigService) {
    this.connection = new IORedis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null
    });
    this.queue = new Queue(REGISTRAR_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 15_000 },
        removeOnComplete: 100,
        removeOnFail: 500
      }
    });
  }

  enqueueRegistration(payload: DomainRegistrationPayload) {
    return this.queue.add(REGISTRAR_REGISTER_DOMAIN_JOB, payload, {
      jobId: `${REGISTRAR_REGISTER_DOMAIN_JOB}:${payload.domainId}`
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
    this.connection.disconnect();
  }
}
