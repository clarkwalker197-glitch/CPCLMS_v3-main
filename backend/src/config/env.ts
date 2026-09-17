// ============================================================
// Environment Configuration (Validated via Zod)
// ============================================================

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

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
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
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
  EMAIL_USER: z.string().email().optional(),
  EMAIL_PASS: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

if (env.NODE_ENV === 'production' && !process.env.COOKIE_SECRET) {
  console.error('❌ COOKIE_SECRET must be set in production.');
  process.exit(1);
}

if (!process.env.COOKIE_SECRET) {
  env.COOKIE_SECRET = 'dev-cookie-secret-change-me';
}

export { env };

