import { Module } from '@nestjs/common';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { DomainsRepository } from '../domains/domains.repository';
import { AuthModule } from '../auth/auth.module';
import { StatusModule } from '../../gateways/status.module';
import { RegistrarQueueService } from '../../workers/queues/registrar-queue.service';
import { DomainRegistrationProcessor } from '../../workers/processors/domain-registration.processor';
import { RegistrarController } from './registrar.controller';
import { RegistrarService } from './registrar.service';
import { SpaceshipService } from './spaceship/spaceship.service';

@Module({
  imports: [AuthModule, StatusModule],
  controllers: [RegistrarController],
  providers: [
    RegistrarService,
    SpaceshipService,
    DomainsRepository,
    RbacGuard,
    RegistrarQueueService,
    DomainRegistrationProcessor
  ],
  exports: [RegistrarService, SpaceshipService]
})
export class RegistrarModule {}
