import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { WinstonModule } from 'nest-winston';
import appConfig from './config/app.config';
import { validateEnv } from './config/env.validation';
import { buildLoggerConfig } from './config/logger.config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { RedisModule } from './common/redis/redis.module';
import { DatabaseModule } from './database/database.module';
import { EmailModule } from './common/email/email.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { StatusModule } from './gateways/status.module';
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
import { VpsHostingModule } from './modules/vps-hosting/vps-hosting.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validate: validateEnv
    }),

    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildLoggerConfig(config.get<string>('LOG_LEVEL', 'info'))
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: config.get<number>('RATE_LIMIT_TTL_SECONDS', 60) * 1000,
          limit: config.get<number>('RATE_LIMIT_MAX_REQUESTS', 100)
        },
        {
          name: 'auth',
          ttl: 60 * 1000,
          limit: 10
        }
      ]
    }),

    // Infrastructure
    DatabaseModule,
    RedisModule,
    EmailModule,

    // Shared services (global)
    PricingModule,
    StatusModule,

    // Domain modules
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
    AdminModule,
    BuilderModule,
    NotificationsModule,
    OrganizationsModule,
    RegistrarModule,
    SslModule,
    WebhooksModule,
    VpsHostingModule
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
