import { Module } from '@nestjs/common';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository, RbacGuard]
})
export class AdminModule {}
