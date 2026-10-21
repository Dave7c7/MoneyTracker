/**
 * Server instrumentation.
 *
 * Runs when the server starts. Validating the configuration here means a
 * misconfigured deployment fails immediately with a clear message instead of
 * failing on the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getEnv } = await import('@/lib/env.ts');
    getEnv();
  }
}
