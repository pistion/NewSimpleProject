import { Module } from '@nestjs/common';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { AuthModule } from '../auth/auth.module';
import { SslController } from './ssl.controller';
import { SslRepository } from './ssl.repository';
import { SslService } from './ssl.service';

@Module({
  imports: [AuthModule],
  controllers: [SslController],
  providers: [SslService, SslRepository, RbacGuard]
})
export class SslModule {}
