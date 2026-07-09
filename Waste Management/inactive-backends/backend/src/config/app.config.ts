import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  name: process.env.APP_NAME ?? 'glondia-backend',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // Render injects PORT automatically; APP_PORT is the override for local dev.
  port: Number(process.env.PORT ?? process.env.APP_PORT ?? 4000),
  url: process.env.APP_URL ?? 'http://localhost:4000',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:4000/api/v1',
  logLevel: process.env.LOG_LEVEL ?? 'info'
}));
