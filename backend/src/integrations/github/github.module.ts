import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { AuthModule } from '../../modules/auth/auth.module';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { QueueModule } from '../../workers/queues/queue.module';
import { GitHubController } from './github.controller';
import { GitHubService } from './github.service';

@Module({
  imports: [
    JwtModule.register({}),
    CryptoModule,
    AuthModule,
    QueueModule,
  ],
  controllers: [GitHubController],
  providers: [GitHubService, RbacGuard],
  exports: [GitHubService],
})
export class GitHubModule {}
