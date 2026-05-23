import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import appConfig from './config/app.config';
import { validateEnv } from './config/env.validation';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { DatabaseModule } from './database/database.module';
import { EmailModule } from './common/email/email.module';
import { ActivityModule } from './modules/activity/activity.module';
import { AdminModule } from './modules/admin/admin.module';
import { ArtifactsModule } from './modules/artifacts/artifacts.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { BuilderModule } from './modules/builder/builder.module';
import { DeploymentsModule } from './modules/deployments/deployments.module';
import { DomainsModule } from './modules/domains/domains.module';
import { GitHubModule } from './integrations/github/github.module';
import { RenderModule } from './integrations/render/render.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { SslModule } from './modules/ssl/ssl.module';
import { RegistrarModule } from './modules/registrar/registrar.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validate: validateEnv
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: config.get<number>('RATE_LIMIT_TTL_SECONDS', 60) * 1000, // ThrottlerModule uses ms
          limit: config.get<number>('RATE_LIMIT_MAX_REQUESTS', 100)
        },
        {
          name: 'auth',
          ttl: 60 * 1000,
          limit: 10 // 10 auth attempts per minute
        }
      ]
    }),

    DatabaseModule,
    EmailModule,

    // Core modules
    ActivityModule,
    ArtifactsModule,
    AuthModule,
    BillingModule,
    DeploymentsModule,
    DomainsModule,
    HealthModule,
    ProjectsModule,
    GitHubModule,
    RenderModule,
    WorkspaceModule,

    // New modules
    AdminModule,
    BuilderModule,
    NotificationsModule,
    OrganizationsModule,
    RegistrarModule,
    SslModule,
    WebhooksModule
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
