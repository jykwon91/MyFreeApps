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
  handleRegister: (
    email: string,
    password: string,
    turnstileToken?: string,
  ) => Promise<void>;
}

/**
 * Recognise the fastapi-users `LOGIN_USER_NOT_VERIFIED` detail string so the
 * Login page can surface a "Resend verification email" CTA. The string MUST
 * match the backend constant exactly — see `app/core/auth.py`.
 */
export function isUnverifiedError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj.data === "object" && obj.data !== null) {
      const data = obj.data as Record<string, unknown>;
      if (data.detail === "LOGIN_USER_NOT_VERIFIED") return true;
    }
    // Axios error responses keep the body under .response.data
    if (typeof obj.response === "object" && obj.response !== null) {
      const resp = obj.response as Record<string, unknown>;
      if (typeof resp.data === "object" && resp.data !== null) {
        const data = resp.data as Record<string, unknown>;
        if (data.detail === "LOGIN_USER_NOT_VERIFIED") return true;
      }
    }
  }
  return false;
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
      // Don't show a generic error toast for the unverified case — the
      // Login page surfaces a dedicated banner with a resend button.
      if (!isUnverifiedError(err)) {
        const message =
          err instanceof Error
            ? err.message
            : "Couldn't sign you in — please try again.";
        showError(message);
      }
      throw err;
    }
  }

  async function handleRegister(
    email: string,
    password: string,
    turnstileToken = "",
  ): Promise<void> {
    try {
      await register(email, password, turnstileToken);
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
