import { Module } from '@nestjs/common';
import { BuildRunnerService } from './build-runner.service';

@Module({
  providers: [BuildRunnerService],
  exports: [BuildRunnerService]
})
export class BuildRunnerModule {}
