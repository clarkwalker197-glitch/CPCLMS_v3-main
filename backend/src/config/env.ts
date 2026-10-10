// ============================================================
// Environment Configuration (Validated via Zod)
// ============================================================

import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import dotenv from 'dotenv';

export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function resolveDotenvPath(): string | undefined {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../../../.env'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

const envPath = resolveDotenvPath();
if (envPath) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const frontendOriginSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return trimmed.length > 1 ? trimmed : trimmed[0] ?? value;
}, z.union([
  z.string().url(),
  z.array(z.string().url()),
]).default('http://localhost:3000'));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('2h'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:cpc-library.online'),
  FRONTEND_URL: frontendOriginSchema,
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? true : v === 'true')),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(20),
  COOKIE_SECRET: z.string().min(16).optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  RESEND_API_KEY: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || undefined : value),
    z.string().optional()
  ),
  EMAIL_FROM: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().optional().refine((value) => {
      if (value === undefined) return true;
      const displayNameAddress = value.match(/^(?:[^<>]*\s)?<([^<>]+)>$/);
      return z.string().email().safeParse(displayNameAddress?.[1] ?? value).success;
    }, 'Invalid email')
  ),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  BLOB_STORE_ID: z.string().optional(),
  VERCEL_OIDC_TOKEN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

if (Boolean(env.VAPID_PUBLIC_KEY) !== Boolean(env.VAPID_PRIVATE_KEY)) {
  console.error('❌ VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be configured together.');
  process.exit(1);
}

if (env.NODE_ENV === 'production' && !process.env.COOKIE_SECRET) {
  console.error('❌ COOKIE_SECRET must be set in production.');
  process.exit(1);
}

if (!process.env.COOKIE_SECRET) {
  env.COOKIE_SECRET = 'dev-cookie-secret-change-me';
}

export { env };
