import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../../database/prisma.service';
import { SpaceshipService } from '../../modules/registrar/spaceship/spaceship.service';
import { StatusGateway } from '../../gateways/status.gateway';
import { DomainRegistrationPayload } from '../queues/registrar-queue.service';
import { REGISTRAR_QUEUE, REGISTRAR_REGISTER_DOMAIN_JOB } from '../queues/queue.constants';

@Injectable()
export class DomainRegistrationProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DomainRegistrationProcessor.name);
  private worker?: Worker;
  private connection?: IORedis;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly spaceship: SpaceshipService,
    private readonly statusGateway: StatusGateway
  ) {}

  onModuleInit() {
    if (this.config.get<string>('NODE_ENV') === 'test') return;

    this.connection = new IORedis(this.config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null
    });

    this.worker = new Worker(REGISTRAR_QUEUE, (job) => this.dispatch(job), {
      connection: this.connection,
      concurrency: 2
    });

    this.worker.on('failed', (job, err) =>
      this.logger.error(`Registrar job ${job?.id} failed: ${err.message}`)
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.connection?.disconnect();
  }

  private async dispatch(job: Job) {
    if (job.name === REGISTRAR_REGISTER_DOMAIN_JOB) {
      return this.registerDomain(job as Job<DomainRegistrationPayload>);
    }
  }

  private async registerDomain(job: Job<DomainRegistrationPayload>) {
    const { domainId, organizationId, hostname, contactId, years, autoRenew, privacyProtection } =
      job.data;

    const domain = await this.prisma.domain.findFirst({
      where: { id: domainId, organizationId }
    });
    if (!domain) {
      this.logger.warn(`Domain ${domainId} not found — skipping registration job.`);
      return;
    }

    this.logger.log(`Registering domain ${hostname} via Spaceship`);
    this.statusGateway.emitDomainUpdate(organizationId, {
      id: domainId,
      hostname,
      status: 'registering'
    });

    try {
      const op = await this.spaceship.registerDomain(hostname, {
        autoRenew,
        years,
        privacyProtection: { level: privacyProtection ? 'high' : 'public', userConsent: true },
        contacts: { registrant: contactId }
      });

      await this.prisma.domain.update({
        where: { id: domainId },
        data: { status: 'pending_verification' }
      });

      this.logger.log(`Domain ${hostname} registration submitted: op=${op.operationId} status=${op.status}`);
      this.statusGateway.emitDomainUpdate(organizationId, {
        id: domainId,
        hostname,
        status: 'pending_verification',
        operationId: op.operationId
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Domain registration failed';
      this.logger.error(`Domain ${hostname} registration failed: ${msg}`);

      await this.prisma.domain.update({
        where: { id: domainId },
        data: { status: 'registration_failed' }
      });

      this.statusGateway.emitDomainUpdate(organizationId, {
        id: domainId,
        hostname,
        status: 'registration_failed',
        error: msg
      });

      throw err;
    }
  }
}
