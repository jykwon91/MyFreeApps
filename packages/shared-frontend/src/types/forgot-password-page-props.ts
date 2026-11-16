import type { ReactNode } from "react";

export interface ForgotPasswordPageProps {
  /**
   * Sends the reset-link request: POST /auth/forgot-password with the Turnstile
   * token as `X-Turnstile-Token` (the app's auth client `forgotPassword`). Must
   * reject on any non-2xx or network failure, so the page never tells the user
   * to check an inbox no email is coming to.
   */
  onRequestReset: (email: string, turnstileToken: string) => Promise<void>;
  /** The form card's heading. Defaults to "Reset your password". */
  heading?: string;
  /** The app's brand icon, shown beside the heading. */
  icon?: ReactNode;
  /** Where "Back to sign in" points. Defaults to /login. */
  loginPath?: string;
}
