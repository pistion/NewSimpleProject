import { Module } from '@nestjs/common';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { AuthModule } from '../auth/auth.module';
import { ArtifactsController } from './artifacts.controller';
import { ArtifactsRepository } from './artifacts.repository';
import { ArtifactsService } from './artifacts.service';

@Module({
  imports: [AuthModule],
  controllers: [ArtifactsController],
  providers: [ArtifactsService, ArtifactsRepository, RbacGuard]
})
export class ArtifactsModule {}
