export interface TwoFactorStepProps {
  /**
   * Signs in again with the saved email and password plus `code` (an
   * authenticator code or a recovery code). Resolves true once signed in and
   * false when the server still asks for a code; rejects on a refused code,
   * whose reason the step shows through describeAuthError.
   */
  onVerify: (code: string) => Promise<boolean>;
  /** Leaves the step for the email and password form. */
  onBack: () => void;
}
