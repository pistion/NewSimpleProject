import { Module } from '@nestjs/common';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { AuthModule } from '../auth/auth.module';
import { BuilderController } from './builder.controller';
import { BuilderRepository } from './builder.repository';
import { BuilderService } from './builder.service';

@Module({
  imports: [AuthModule],
  controllers: [BuilderController],
  providers: [BuilderService, BuilderRepository, RbacGuard]
})
export class BuilderModule {}
