import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('glondia-backend'),
  // Render injects PORT; APP_PORT is the local dev override
  PORT: z.coerce.number().int().positive().optional(),
  APP_PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default('http://localhost:4000'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  API_BASE_URL: z.string().url().default('http://localhost:4000/api/v1'),

  // Database & cache
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  // Auth
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  FIELD_ENCRYPTION_KEY: z.string().min(8),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // S3 / object storage
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_ACCESS_KEY_ID: z.string().min(1).default('glondia_minio'),
  S3_SECRET_ACCESS_KEY: z.string().min(1).default('glondia_minio_secret'),
  S3_ARTIFACTS_BUCKET: z.string().min(1).default('glondia-artifacts'),
  S3_ASSETS_BUCKET: z.string().min(1).default('glondia-assets'),
  /** Base URL used to build public URLs for assets stored in S3. */
  S3_PUBLIC_URL: z.string().url().default('http://localhost:9000'),

  // Stripe
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),

  // GitHub OAuth integration
  GITHUB_CLIENT_ID: z.string().default(''),
  GITHUB_CLIENT_SECRET: z.string().default(''),
  // Full callback URL — must match exactly what's registered in the GitHub OAuth app
  GITHUB_REDIRECT_URI: z.string().url().default('http://localhost:4000/api/v1/github/callback'),
  // Secret for validating incoming webhook payloads (set in GitHub repo/org → Settings → Webhooks)
  GITHUB_WEBHOOK_SECRET: z.string().default(''),
  // Optional PAT for cloning private repos when user OAuth token is unavailable
  GITHUB_TOKEN: z.string().default(''),

  // Render hosting provider
  RENDER_API_KEY: z.string().default(''),
  RENDER_API_BASE_URL: z.string().url().default('https://api.render.com/v1'),

  // Email
  EMAIL_PROVIDER: z.enum(['log', 'resend', 'smtp']).default('log'),
  RESEND_API_KEY: z.string().default(''),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  EMAIL_FROM: z.string().default('no-reply@glondia.com'),

  // CORS — comma-separated extra allowed origins beyond FRONTEND_URL + localhost
  // Example: https://glondiasites.onrender.com,https://www.glondia.app
  CORS_ORIGINS: z.string().default(''),

  // Rate limiting
  RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),

  LOG_LEVEL: z.string().default('info')
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid backend environment: ${details}`);
  }

  return result.data;
}
