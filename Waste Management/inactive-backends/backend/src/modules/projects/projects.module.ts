import { Module } from '@nestjs/common';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { AuthModule } from '../auth/auth.module';
import { ProjectsController } from './projects.controller';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

@Module({
  imports: [AuthModule, CryptoModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectsRepository, RbacGuard]
})
export class ProjectsModule {}
