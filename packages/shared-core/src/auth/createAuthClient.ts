import api from "../lib/api";
import { notifyAuthChange, onIdentityChange } from "../lib/auth-store";
import { getPlatform } from "../platform/configurePlatform";
import { baseApi } from "../store/baseApi";
import type { LoginResponse } from "../types/security/login-response";
import type { LoginResult } from "../types/security/login-result";
import type { AuthClientStore } from "./types/AuthClientStore";

function turnstileHeaders(turnstileToken: string): Record<string, string> {
  return turnstileToken ? { "X-Turnstile-Token": turnstileToken } : {};
}

/**
 * The auth calls an app makes, bound to that app's Redux store so an identity
 * change can wipe its API cache. An app exports the ones it uses from its own
 * `lib/auth.ts`.
 */
export function createAuthClient(store: AuthClientStore) {
  // Every query cached under the previous identity (such as /users/me) is stale the
  // moment it changes, however it changes: a sign-in or sign-out here, a rejected
  // token, or another tab. notifyAuthChange() resets before the re-render that
  // refetches against the new token, and leaves a refresh for the same user alone.
  const stopResettingCache = onIdentityChange(() => {
    store.dispatch(baseApi.util.resetApiState());
  });

  return {
    /**
     * Sign in via the unified TOTP login endpoint, which is also the right
     * endpoint for users without 2FA. Handles three cases:
     *
     *   1. Users without 2FA enabled: single round trip, JWT issued immediately.
     *   2. Users with 2FA enabled, no code yet: the backend returns
     *      `{detail: "totp_required"}` and the caller asks for the authenticator
     *      code, then calls signIn again with `totpCode` populated.
     *   3. Unverified email: the backend returns 400 LOGIN_USER_NOT_VERIFIED, which
     *      rejects here so the caller can offer to resend the verification email.
     */
    async signIn(email: string, password: string, totpCode?: string): Promise<LoginResult> {
      const response = await api.post<LoginResponse>("/auth/totp/login", {
        email,
        password,
        totp_code: totpCode,
      });

      if (response.data.detail === "totp_required") {
        return { status: "totp_required" };
      }

      if (response.data.access_token) {
        getPlatform().tokenStore.set(response.data.access_token);
        notifyAuthChange();
        return { status: "ok" };
      }

      throw new Error("Login response did not contain a token or TOTP challenge.");
    },

    /**
     * Register a new account. The backend sends a verification email and the user
     * must click the link before logging in, so this does not sign them in.
     *
     * A Turnstile token is forwarded as `X-Turnstile-Token` for the backend's
     * `require_turnstile` dependency. In dev / CI it is empty and the backend
     * short-circuits the check.
     */
    async register(email: string, password: string, turnstileToken = ""): Promise<void> {
      await api.post(
        "/auth/register",
        { email, password },
        { headers: turnstileHeaders(turnstileToken) },
      );
    },

    /** As `register`, for an app whose sign-up form asks for a display name. */
    async registerWithDisplayName(
      email: string,
      password: string,
      displayName?: string,
      turnstileToken = "",
    ): Promise<void> {
      await api.post(
        "/auth/register",
        { email, password, display_name: displayName?.trim() ?? "" },
        { headers: turnstileHeaders(turnstileToken) },
      );
    },

    /**
     * Request a fresh verification email for an unverified account. The endpoint
     * always returns 202, even for unknown or already-verified emails, to avoid
     * leaking which addresses are registered.
     */
    async requestVerifyToken(email: string): Promise<void> {
      await api.post("/auth/request-verify-token", { email });
    },

    /**
     * Request a password-reset email. The backend always returns 202 so it never
     * leaks which addresses are registered. Turnstile token forwarded as in
     * `register`.
     */
    async forgotPassword(email: string, turnstileToken = ""): Promise<void> {
      await api.post(
        "/auth/forgot-password",
        { email },
        { headers: turnstileHeaders(turnstileToken) },
      );
    },

    /**
     * Submit a new password using the token from the reset email. This step has no
     * Turnstile gate: the emailed token is the security control. Failures reject so
     * the caller can tell an expired link from a weak password or a network error.
     */
    async resetPassword(token: string, password: string): Promise<void> {
      await api.post("/auth/reset-password", { token, password });
    },

    /**
     * Sign out: clear the token, wipe the API cache so the next signed-in user
     * doesn't see this user's data, and notify subscribers.
     */
    signOut(): void {
      getPlatform().tokenStore.clear();
      notifyAuthChange();
    },

    /**
     * Stop resetting the store's cache on identity changes. For the module that made
     * this client when it is replaced, as hot reload does, so resets don't pile up.
     */
    dispose: stopResettingCache,
  };
}
