/**
 * Environment configuration.
 *
 * Every setting comes from the environment and is validated at startup with
 * Zod. The app fails fast with a clear message rather than running with a
 * half-configured database.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';
import { z } from 'zod';

const envSchema = z.object({
  /** Postgres connection string. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /** IANA timezone used for monthly buckets. */
  APP_TIMEZONE: z.string().min(1).default('UTC'),
  /** Currency used when an account has none. */
  DEFAULT_CURRENCY: z.string().length(3).default('USD'),
  /** Locale used for number and currency formatting. */
  DEFAULT_LOCALE: z.string().min(2).default('en-US'),
  /** Which data source adapter to use. */
  ADAPTER_ID: z.string().min(1).default('mock'),
  /**
   * Assignments below this confidence go to the review inbox.
   * Bank-provided categories are capped at 0.7, so the default of 0.8 sends
   * them to review as well.
   */
  REVIEW_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
  /** Email of the single local user. */
  DEFAULT_USER_EMAIL: z.string().email().default('you@example.com'),
  /** Display name of the single local user. */
  DEFAULT_USER_NAME: z.string().min(1).default('Me'),
});

/** Validated application configuration. */
export type AppEnv = z.infer<typeof envSchema>;

/**
 * Loads the repository `.env` file.
 *
 * The file lives at the repository root, while commands often run from a
 * package directory, so the loader walks up until it finds it.
 *
 * @example
 * loadDotEnv(); // then process.env.DATABASE_URL is set
 */
export function loadDotEnv(): void {
  let directory = path.dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(directory, '.env');
    if (existsSync(candidate)) {
      config({ path: candidate });
      return;
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
}

/**
 * Parses and validates the environment.
 *
 * @example
 * const env = loadEnv(); // throws with a readable message when DATABASE_URL is missing
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill in the values.`,
    );
  }
  return parsed.data;
}

let cachedEnv: AppEnv | null = null;

/**
 * Returns the validated configuration, loading the `.env` file once.
 *
 * @example
 * getEnv().REVIEW_CONFIDENCE_THRESHOLD; // 0.8
 */
export function getEnv(): AppEnv {
  if (!cachedEnv) {
    loadDotEnv();
    cachedEnv = loadEnv();
  }
  return cachedEnv;
}
