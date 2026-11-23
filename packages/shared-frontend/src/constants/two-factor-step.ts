/** Shortest code the sign-in 2FA step accepts: an authenticator app's 6 digits. */
export const TWO_FACTOR_CODE_MIN_LENGTH = 6;

/** Longest code the sign-in 2FA step accepts: an 8-character recovery code. */
export const TWO_FACTOR_CODE_MAX_LENGTH = 8;

/** What the sign-in 2FA step says. */
export const TWO_FACTOR_STEP_COPY = {
  label: "Authentication code",
  hint: "Enter the 6-digit code from your authenticator app, or a recovery code.",
  placeholder: "000000",
  verify: "Verify",
  verifying: "Verifying...",
  back: "Back to login",
  rateLimited: "Too many sign-in attempts. Try again in a few minutes.",
  retryIn: (seconds: number) => `Try again in ${seconds}s`,
  notAccepted: "Authentication code didn't go through. Please try again.",
} as const;
