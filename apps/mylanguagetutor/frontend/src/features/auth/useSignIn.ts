import { signIn } from "@/lib/auth";
import { showError } from "@platform/ui";
import type { LoginResult } from "@/types/security/login-result";

interface UseSignInResult {
  handleSignIn: (
    email: string,
    password: string,
    totpCode?: string,
  ) => Promise<LoginResult>;
}

/**
 * Recognise the fastapi-users `LOGIN_USER_NOT_VERIFIED` detail string so the
 * Login page can surface a "Resend verification email" CTA.
 * Mirrors apps/myjobhunter/frontend/src/features/auth/useSignIn.ts.
 */
export function isUnverifiedError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj.data === "object" && obj.data !== null) {
      const data = obj.data as Record<string, unknown>;
      if (data.detail === "LOGIN_USER_NOT_VERIFIED") return true;
    }
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

export function useSignIn(): UseSignInResult {
  async function handleSignIn(
    email: string,
    password: string,
    totpCode?: string,
  ): Promise<LoginResult> {
    try {
      return await signIn(email, password, totpCode);
    } catch (err: unknown) {
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

  return { handleSignIn };
}
