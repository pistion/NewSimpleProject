import { Module } from '@nestjs/common';
import { StorageModule } from '../../modules/storage/storage.module';
import { StatusModule } from '../../gateways/status.module';
import { BuildRunnerModule } from '../build-runner/build-runner.module';
import { DeploymentQueueService } from './deployment-queue.service';
import { DeploymentProcessor } from '../processors/deployment.processor';

@Module({
  imports: [BuildRunnerModule, StorageModule, StatusModule],
  providers: [DeploymentQueueService, DeploymentProcessor],
  exports: [DeploymentQueueService]
})
export class QueueModule {}
