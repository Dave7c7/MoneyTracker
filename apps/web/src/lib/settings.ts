/**
 * Settings that are safe to use in the browser.
 *
 * The server reads its configuration from the environment, but a client
 * component must never import the database package, so the few values the
 * UI needs live here.
 */

/** The locale used to format numbers and dates in the browser. */
export const UI_LOCALE = 'en-US';

/** The currency used when a row has none. Every stored row has one. */
export const UI_CURRENCY = 'USD';
