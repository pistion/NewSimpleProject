import { Module } from '@nestjs/common';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { AuthModule } from '../../modules/auth/auth.module';
import { RenderController } from './render.controller';
import { RenderService } from './render.service';

@Module({
  imports: [AuthModule],
  controllers: [RenderController],
  providers: [RenderService, RbacGuard],
  exports: [RenderService]
})
export class RenderModule {}
