import { existsSync } from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';
import { z } from 'zod';

import { createLogger } from './logger';

// Load the first `.env` we can find: the current working directory first, then
// the repository root. This keeps both `npm run dev --workspace=apps/api`
// (cwd = apps/api) and `tsx scripts/seed.ts` (cwd = repo root) pointed at the
// same environment file.
const environmentCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '..', '.env'),
];
for (const candidate of environmentCandidates) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  apiPrefix: string;
  apiVersion: string;
  frontendUrl: string;
  mongodb: { uri: string };
  jwt: { secret: string; expiresIn: string; refreshSecret: string; refreshExpiresIn: string };
  auth: {
    cookieSecure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    accessCookieName: string;
    refreshCookieName: string;
    csrfCookieName: string;
    accessCookieMaxAgeMs: number;
    refreshCookieMaxAgeMs: number;
    csrfHeaderName: string;
    idempotencyHeaderName: string;
    requireEmailVerification: boolean;
    emailVerificationTtlMinutes: number;
    passwordResetTtlMinutes: number;
  };
  bcrypt: { rounds: number };
  payments: {
    provider: 'unselected' | 'development_mock';
    webhookSecret: string;
    pendingTimeoutMinutes: number;
    maxRefundAttempts: number;
  };
  stripe: { secretKey: string; publishableKey: string; webhookSecret: string };
  email: { host: string; port: number; user: string; pass: string; from: string };
  aws: { accessKeyId: string; secretAccessKey: string; region: string; s3Bucket: string };
  rateLimit: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
    authMaxRequests: number;
    writeMaxRequests: number;
    passwordRecoveryMaxRequests: number;
  };
  pagination: { defaultLimit: number; maxLimit: number };
  bodyLimit: string;
  booking: { holdMinutes: number };
  notifications: { maxAttempts: number; batchSize: number };
  admin: { email: string; password: string };
  log: {
    level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
    format: 'json' | 'pretty';
  };
}

const booleanFlag = (defaultValue: boolean) =>
  z
    .enum(['true', 'false'])
    .default(defaultValue ? 'true' : 'false')
    .transform(value => value === 'true');

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    API_VERSION: z
      .string()
      .regex(/^v\d+$/, 'Must look like v1')
      .default('v1'),
    API_PREFIX: z.string().min(1).optional(),
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),
    MONGODB_URI: z.string().trim().min(1).default('mongodb://localhost:27017/pickleball_booking'),

    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().min(1).default('15m'),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_REFRESH_EXPIRES_IN: z.string().min(1).default('7d'),

    AUTH_COOKIE_SECURE: booleanFlag(false),
    AUTH_COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
    AUTH_ACCESS_COOKIE_NAME: z.string().min(1).default('pb_access'),
    AUTH_REFRESH_COOKIE_NAME: z.string().min(1).default('pb_refresh'),
    AUTH_CSRF_COOKIE_NAME: z.string().min(1).default('pb_csrf'),
    AUTH_CSRF_HEADER_NAME: z.string().min(1).default('x-csrf-token'),
    AUTH_IDEMPOTENCY_HEADER_NAME: z.string().min(1).default('idempotency-key'),
    AUTH_ACCESS_COOKIE_MAX_AGE_MS: z.coerce.number().int().positive().default(900000),
    AUTH_REFRESH_COOKIE_MAX_AGE_MS: z.coerce.number().int().positive().default(604800000),

    AUTH_REQUIRE_EMAIL_VERIFICATION: booleanFlag(true),
    EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(10080).default(1440),
    PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),

    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(31).default(12),

    PAYMENT_PROVIDER: z.enum(['unselected', 'development_mock']).default('unselected'),
    PAYMENT_WEBHOOK_SECRET: z.string().default(''),
    PAYMENT_PENDING_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(30),
    PAYMENT_MAX_REFUND_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    BOOKING_HOLD_MINUTES: z.coerce.number().int().min(1).max(60).default(10),

    STRIPE_SECRET_KEY: z.string().default(''),
    STRIPE_PUBLISHABLE_KEY: z.string().default(''),
    STRIPE_WEBHOOK_SECRET: z.string().default(''),

    SMTP_HOST: z.string().default(''),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().default(''),
    SMTP_PASS: z.string().default(''),
    EMAIL_FROM: z.string().email().default('noreply@pickleball-booking.com'),

    AWS_ACCESS_KEY_ID: z.string().default(''),
    AWS_SECRET_ACCESS_KEY: z.string().default(''),
    AWS_REGION: z.string().min(1).default('us-east-1'),
    AWS_S3_BUCKET: z.string().default(''),

    RATE_LIMIT_ENABLED: booleanFlag(true),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(300),
    RATE_LIMIT_AUTH_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
    RATE_LIMIT_WRITE_MAX_REQUESTS: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_PASSWORD_RECOVERY_MAX_REQUESTS: z.coerce.number().int().positive().default(5),

    PAGINATION_DEFAULT_LIMIT: z.coerce.number().int().min(1).max(200).default(20),
    PAGINATION_MAX_LIMIT: z.coerce.number().int().min(1).max(500).default(100),

    BODY_LIMIT: z.string().min(1).default('100kb'),
    NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
    NOTIFICATION_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),

    ADMIN_EMAIL: z.string().email().default('admin@pickleball.com'),
    ADMIN_PASSWORD: z.string().min(6).default('Admin@12345'),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  })
  .superRefine((values, context) => {
    if (values.AUTH_COOKIE_SAME_SITE === 'none' && !values.AUTH_COOKIE_SECURE) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_COOKIE_SECURE'],
        message: 'AUTH_COOKIE_SECURE must be true when SameSite is none',
      });
    }
    if (values.NODE_ENV === 'production' && !values.AUTH_COOKIE_SECURE) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_COOKIE_SECURE'],
        message: 'AUTH_COOKIE_SECURE must be true in production',
      });
    }
    if (values.PAGINATION_DEFAULT_LIMIT > values.PAGINATION_MAX_LIMIT) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAGINATION_DEFAULT_LIMIT'],
        message: 'PAGINATION_DEFAULT_LIMIT cannot exceed PAGINATION_MAX_LIMIT',
      });
    }
  });

export type RawEnvironment = z.input<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  const values = environmentSchema.parse(environment);
  const apiVersion = values.API_VERSION;

  return {
    nodeEnv: values.NODE_ENV,
    port: values.PORT,
    apiVersion,
    apiPrefix: values.API_PREFIX ?? `/api/${apiVersion}`,
    frontendUrl: values.FRONTEND_URL,
    mongodb: { uri: values.MONGODB_URI },
    jwt: {
      secret: values.JWT_SECRET,
      expiresIn: values.JWT_EXPIRES_IN,
      refreshSecret: values.JWT_REFRESH_SECRET,
      refreshExpiresIn: values.JWT_REFRESH_EXPIRES_IN,
    },
    auth: {
      cookieSecure: values.AUTH_COOKIE_SECURE,
      sameSite: values.AUTH_COOKIE_SAME_SITE,
      accessCookieName: values.AUTH_ACCESS_COOKIE_NAME,
      refreshCookieName: values.AUTH_REFRESH_COOKIE_NAME,
      csrfCookieName: values.AUTH_CSRF_COOKIE_NAME,
      accessCookieMaxAgeMs: values.AUTH_ACCESS_COOKIE_MAX_AGE_MS,
      refreshCookieMaxAgeMs: values.AUTH_REFRESH_COOKIE_MAX_AGE_MS,
      csrfHeaderName: values.AUTH_CSRF_HEADER_NAME.toLowerCase(),
      idempotencyHeaderName: values.AUTH_IDEMPOTENCY_HEADER_NAME.toLowerCase(),
      requireEmailVerification: values.AUTH_REQUIRE_EMAIL_VERIFICATION,
      emailVerificationTtlMinutes: values.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES,
      passwordResetTtlMinutes: values.PASSWORD_RESET_TOKEN_TTL_MINUTES,
    },
    bcrypt: { rounds: values.BCRYPT_ROUNDS },
    payments: {
      provider: values.PAYMENT_PROVIDER,
      webhookSecret: values.PAYMENT_WEBHOOK_SECRET,
      pendingTimeoutMinutes: values.PAYMENT_PENDING_TIMEOUT_MINUTES,
      maxRefundAttempts: values.PAYMENT_MAX_REFUND_ATTEMPTS,
    },
    stripe: {
      secretKey: values.STRIPE_SECRET_KEY,
      publishableKey: values.STRIPE_PUBLISHABLE_KEY,
      webhookSecret: values.STRIPE_WEBHOOK_SECRET,
    },
    email: {
      host: values.SMTP_HOST,
      port: values.SMTP_PORT,
      user: values.SMTP_USER,
      pass: values.SMTP_PASS,
      from: values.EMAIL_FROM,
    },
    aws: {
      accessKeyId: values.AWS_ACCESS_KEY_ID,
      secretAccessKey: values.AWS_SECRET_ACCESS_KEY,
      region: values.AWS_REGION,
      s3Bucket: values.AWS_S3_BUCKET,
    },
    rateLimit: {
      enabled: values.RATE_LIMIT_ENABLED,
      windowMs: values.RATE_LIMIT_WINDOW_MS,
      maxRequests: values.RATE_LIMIT_MAX_REQUESTS,
      authMaxRequests: values.RATE_LIMIT_AUTH_MAX_REQUESTS,
      writeMaxRequests: values.RATE_LIMIT_WRITE_MAX_REQUESTS,
      passwordRecoveryMaxRequests: values.RATE_LIMIT_PASSWORD_RECOVERY_MAX_REQUESTS,
    },
    pagination: {
      defaultLimit: values.PAGINATION_DEFAULT_LIMIT,
      maxLimit: values.PAGINATION_MAX_LIMIT,
    },
    bodyLimit: values.BODY_LIMIT,
    booking: { holdMinutes: values.BOOKING_HOLD_MINUTES },
    notifications: {
      maxAttempts: values.NOTIFICATION_MAX_ATTEMPTS,
      batchSize: values.NOTIFICATION_BATCH_SIZE,
    },
    admin: {
      email: values.ADMIN_EMAIL,
      password: values.ADMIN_PASSWORD,
    },
    log: { level: values.LOG_LEVEL, format: values.LOG_FORMAT },
  };
}

export const config = loadConfig();
export const logger = createLogger({ log: config.log, nodeEnv: config.nodeEnv });
export const isDevelopment = config.nodeEnv === 'development';
export const isProduction = config.nodeEnv === 'production';
export const isTest = config.nodeEnv === 'test';

export * from './database';
