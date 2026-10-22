/**
 * What makes a password acceptable.
 *
 * This is the rule the form and the server both use, so they can never
 * disagree about whether a password is allowed. It is pure: no crypto here,
 * because the form runs in the browser.
 */

/** The shortest password the app accepts. */
export const MIN_PASSWORD_LENGTH = 10;

/**
 * What is wrong with a password, in words the user can act on.
 *
 * Length is the only rule: a long passphrase beats a short puzzle, and rules
 * about symbols push people toward passwords they cannot remember.
 *
 * @example
 * passwordProblem('short'); // 'Use at least 10 characters.'
 */
export function passwordProblem(password: string): string | null {
  if (typeof password !== 'string' || password.length === 0) {
    return 'A password is required.';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 1024) return 'That password is too long.';
  return null;
}
