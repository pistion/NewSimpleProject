import { Module } from '@nestjs/common';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { EmailModule } from '../../common/email/email.module';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsRepository } from './organizations.repository';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationsRepository, RbacGuard],
  exports: [OrganizationsService]
})
export class OrganizationsModule {}
