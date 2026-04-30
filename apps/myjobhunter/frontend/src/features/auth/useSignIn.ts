import { signIn, register } from "@/lib/auth";
import { showError } from "@platform/ui";
import type { LoginResult } from "@/types/security/login-result";

interface UseSignInResult {
  /** Returns the result of the login attempt — `ok` (token stashed) or
   * `totp_required` (caller should show the TOTP challenge step and call
   * back in with `totpCode` populated). Errors propagate after surfacing a
   * toast. */
  handleSignIn: (
    email: string,
    password: string,
    totpCode?: string,
  ) => Promise<LoginResult>;
  handleRegister: (email: string, password: string) => Promise<void>;
}

/**
 * Wraps signIn/register helpers from lib/auth for use with the Login page.
 * Shows a toast on unexpected errors that aren't surfaced inline.
 */
export function useSignIn(): UseSignInResult {
  async function handleSignIn(
    email: string,
    password: string,
    totpCode?: string,
  ): Promise<LoginResult> {
    try {
      return await signIn(email, password, totpCode);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Couldn't sign you in — please try again.";
      showError(message);
      throw err;
    }
  }

  async function handleRegister(
    email: string,
    password: string,
  ): Promise<void> {
    try {
      await register(email, password);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Couldn't create your account — please try again.";
      showError(message);
      throw err;
    }
  }

  return { handleSignIn, handleRegister };
}
