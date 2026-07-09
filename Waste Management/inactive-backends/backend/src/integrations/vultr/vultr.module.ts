import { Module } from '@nestjs/common';
import { VultrService } from './vultr.service';

@Module({
  providers: [VultrService],
  exports: [VultrService],
})
export class VultrModule {}
