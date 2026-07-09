import { Module } from '@nestjs/common';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RenderModule } from '../../integrations/render/render.module';
import { QueueModule } from '../../workers/queues/queue.module';
import { AuthModule } from '../auth/auth.module';
import { DeploymentsController } from './deployments.controller';
import { DeploymentsRepository } from './deployments.repository';
import { DeploymentsService } from './deployments.service';

@Module({
  imports: [AuthModule, QueueModule, RenderModule],
  controllers: [DeploymentsController],
  providers: [DeploymentsService, DeploymentsRepository, RbacGuard]
})
export class DeploymentsModule {}
