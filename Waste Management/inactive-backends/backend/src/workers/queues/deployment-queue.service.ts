import { OnModuleDestroy, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { DEPLOYMENTS_QUEUE, PROCESS_DEPLOYMENT_BUILD_JOB } from './queue.constants';

export interface ProcessDeploymentBuildPayload {
  version: 1;
  organizationId: string;
  deploymentId: string;
  requestedByUserId: string | null;
}

@Injectable()
export class DeploymentQueueService implements OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly queue: Queue<ProcessDeploymentBuildPayload>;

  constructor(config: ConfigService) {
    this.connection = new IORedis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null
    });
    this.queue = new Queue<ProcessDeploymentBuildPayload>(DEPLOYMENTS_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        removeOnComplete: 100,
        removeOnFail: 500
      }
    });
  }

  enqueueBuild(payload: ProcessDeploymentBuildPayload) {
    return this.queue.add(PROCESS_DEPLOYMENT_BUILD_JOB, payload, {
      jobId: `${PROCESS_DEPLOYMENT_BUILD_JOB}:${payload.deploymentId}`
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
    this.connection.disconnect();
  }
}
