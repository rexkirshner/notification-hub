/**
 * Environment Variable Validation
 *
 * Validates and exports typed environment variables.
 * Throws at startup if required variables are missing.
 *
 * Usage: import { env } from '@/lib/env';
 */

import { z } from "zod";

const envSchema = z.object({
  // Database (required)
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // ntfy.sh configuration
  NTFY_DEFAULT_TOPIC: z.string().min(1, "NTFY_DEFAULT_TOPIC is required"),
  NTFY_BASE_URL: z.string().url().default("https://ntfy.sh"),
  NTFY_TIMEOUT_MS: z.coerce.number().positive().default(2000),

  // Dashboard auth (optional for initial setup, required for dashboard)
  ADMIN_PASSWORD_HASH: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(24),

  // Optional configuration
  IDEMPOTENCY_TTL_HOURS: z.coerce.number().positive().default(24),
  RETENTION_DAYS: z.coerce.number().positive().default(30),
  RETRY_MAX_ATTEMPTS: z.coerce.number().positive().default(5),

  // Node environment
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

// Parse and validate environment variables
function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("Environment validation failed:");
    console.error(result.error.format());
    throw new Error("Invalid environment configuration");
  }

  return result.data;
}

// Export validated environment (lazy initialization for edge runtime compatibility)
let _env: z.infer<typeof envSchema> | null = null;

export function getEnv() {
  if (!_env) {
    _env = validateEnv();
  }
  return _env;
}

// For convenience, also export a typed env object that validates on access
export const env = new Proxy({} as z.infer<typeof envSchema>, {
  get(_target, prop: string) {
    return getEnv()[prop as keyof z.infer<typeof envSchema>];
  },
});

// Type export for external use
export type Env = z.infer<typeof envSchema>;
