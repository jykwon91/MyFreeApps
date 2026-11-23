export interface TwoFactorStepProps {
  /**
   * Signs in again with the saved email and password plus `code` (an
   * authenticator code or a recovery code). Resolves true once signed in and
   * false when the server still asks for a code; rejects on a refused code,
   * whose reason the step shows through describeAuthError. A rejection with a
   * 429 (too many attempts) is shown as a lockout message and locks Verify for
   * RATE_LIMIT_COOLDOWN_SECONDS with a "Try again in Ns" countdown, so let it through.
   */
  onVerify: (code: string) => Promise<boolean>;
  /** Leaves the step for the email and password form. */
  onBack: () => void;
}
