import { Module } from '@nestjs/common';
import { VultrModule } from '../../integrations/vultr/vultr.module';
import { StatusModule } from '../../gateways/status.module';
import { VpsQueueService } from '../../workers/queues/vps-queue.service';
import { VpsProvisioningProcessor } from '../../workers/processors/vps-provisioning.processor';
import { VpsHostingController } from './vps-hosting.controller';
import { VpsHostingService } from './vps-hosting.service';

@Module({
  imports: [VultrModule, StatusModule],
  controllers: [VpsHostingController],
  providers: [VpsHostingService, VpsQueueService, VpsProvisioningProcessor],
  exports: [VpsHostingService]
})
export class VpsHostingModule {}
