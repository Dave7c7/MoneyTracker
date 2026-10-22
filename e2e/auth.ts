/**
 * The password the end-to-end tests use.
 *
 * It is set once, in the global setup, on a database that was just reset. It
 * is not a secret: it exists only inside the test scratch database, which is
 * wiped before and after the run.
 */
export const E2E_PASSWORD = 'end to end test password';

/** Where the signed-in cookie is kept between the setup and the tests. */
export const E2E_STATE_PATH = 'e2e/.auth/state.json';
