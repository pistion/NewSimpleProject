import 'reflect-metadata';
import compression from 'compression';
import helmet from 'helmet';
import { ClassSerializerInterceptor, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  // Use Winston as the NestJS logger
  const winstonLogger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(winstonLogger);

  // Enable WebSocket adapter (needed for StatusGateway)
  app.useWebSocketAdapter(new IoAdapter(app));
  const config = app.get(ConfigService);
  const reflector = app.get(Reflector);
  const port = config.getOrThrow<number>('app.port');

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1'
  });
  // Build the allowed-origin list from CORS_ORIGINS (comma-separated) or fall back
  // to FRONTEND_URL.  localhost entries are always included for local dev.
  const frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:5173');
  const rawCorsOrigins = config.get<string>('CORS_ORIGINS', '');
  const allowedOrigins = new Set<string>([
    'http://localhost:5173',
    'http://localhost:4000',
    frontendUrl,
    ...rawCorsOrigins.split(',').map(s => s.trim()).filter(Boolean),
  ]);
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, Swagger UI)
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      callback(new Error(`CORS: origin not allowed — ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-Id', 'X-Request-Id'],
  });
  app.use(helmet());
  app.use(compression());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true
  }));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(reflector),
    new ResponseEnvelopeInterceptor()
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Glondia Sites API')
    .setDescription('Backend API for the Glondia Sites platform.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
}

bootstrap();
