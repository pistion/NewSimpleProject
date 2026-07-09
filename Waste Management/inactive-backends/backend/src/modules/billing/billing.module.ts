import { Module } from '@nestjs/common';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { AuthModule } from '../auth/auth.module';
import { BillingController } from './billing.controller';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
import { PayPalService } from './paypal.service';

@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [BillingService, PayPalService, BillingRepository, RbacGuard]
})
export class BillingModule {}
