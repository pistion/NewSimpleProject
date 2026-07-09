import { Module } from '@nestjs/common';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { AuthModule } from '../auth/auth.module';
import { DomainsController } from './domains.controller';
import { DomainsRepository } from './domains.repository';
import { DomainsService } from './domains.service';

@Module({
  imports: [AuthModule],
  controllers: [DomainsController],
  providers: [DomainsService, DomainsRepository, RbacGuard]
})
export class DomainsModule {}
