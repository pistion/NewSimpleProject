import { Module } from '@nestjs/common';
import { VultrModule } from '../../integrations/vultr/vultr.module';
import { VpsHostingController } from './vps-hosting.controller';
import { VpsHostingService } from './vps-hosting.service';

@Module({
  imports: [VultrModule],
  controllers: [VpsHostingController],
  providers: [VpsHostingService],
  exports: [VpsHostingService],
})
export class VpsHostingModule {}
