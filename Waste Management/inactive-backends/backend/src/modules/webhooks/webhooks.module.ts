import { Module } from '@nestjs/common';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { AuthModule } from '../auth/auth.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksRepository } from './webhooks.repository';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [AuthModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhooksRepository, RbacGuard],
  exports: [WebhooksService]
})
export class WebhooksModule {}
