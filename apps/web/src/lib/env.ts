/**
 * Environment access.
 *
 * The configuration is validated with Zod the first time it is read, and the
 * server refuses to start with a bad configuration (see `instrumentation.ts`).
 */

import { getEnv as getDbEnv, type AppEnv } from '@moneytracker/db';

/**
 * Returns the validated configuration.
 *
 * @example
 * const env = getEnv();
 * env.APP_TIMEZONE; // "America/Los_Angeles"
 */
export function getEnv(): AppEnv {
  return getDbEnv();
}
