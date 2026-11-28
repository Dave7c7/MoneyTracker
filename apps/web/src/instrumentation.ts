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

    // The app syncs its bank connections by itself (see `lib/auto-sync.ts`).
    // Skipped during `next build`, which also loads this file.
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      const { startAutoSync } = await import('@/lib/auto-sync.ts');
      startAutoSync();
    }
  }
}
