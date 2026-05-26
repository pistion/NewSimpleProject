import { Module } from '@nestjs/common';
import { VultrController } from './vultr.controller';
import { VultrService } from './vultr.service';

@Module({
  controllers: [VultrController],
  providers: [VultrService],
  exports: [VultrService],
})
export class VultrModule {}
