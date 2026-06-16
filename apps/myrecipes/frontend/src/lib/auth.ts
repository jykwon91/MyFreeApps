import api from "@/lib/api";
import { baseApi, notifyAuthChange } from "@platform/ui";
import { store } from "@/lib/store";
import type { LoginResult } from "@/types/security/login-result";

interface LoginResponse {
  access_token?: string;
  token_type?: string;
  detail?: string;
}

interface RegisterResponse {
  id: string;
  email: string;
}

/**
 * Sign in via the unified TOTP login endpoint. Handles three cases:
 *
 *   1. Users without 2FA enabled — single round trip, JWT issued immediately.
 *   2. Users with 2FA enabled, no code yet — backend returns
 *      ``{detail: "totp_required"}`` and the caller asks for the authenticator
 *      code, then calls signIn again with ``totpCode`` populated.
 *   3. Unverified email — backend returns 400 LOGIN_USER_NOT_VERIFIED.
 *
 * Mirrors apps/myjobhunter/frontend/src/lib/auth.ts.
 */
export async function signIn(
  email: string,
  password: string,
  totpCode?: string,
): Promise<LoginResult> {
  const response = await api.post<LoginResponse>("/auth/totp/login", {
    email,
    password,
    totp_code: totpCode,
  });

  if (response.data.detail === "totp_required") {
    return { status: "totp_required" };
  }

  if (response.data.access_token) {
    localStorage.setItem("token", response.data.access_token);
    store.dispatch(baseApi.util.resetApiState());
    notifyAuthChange();
    return { status: "ok" };
  }

  throw new Error("Login response did not contain a token or TOTP challenge.");
}

/**
 * Register a new account via fastapi-users.
 *
 * The backend sends a verification email; the new user must click the link
 * before they can log in. We do NOT auto-sign-in after registration — the
 * Register page shows a "check your inbox" notice instead.
 *
 * When a Turnstile token is supplied it is forwarded as the
 * ``X-Turnstile-Token`` header so the backend ``require_turnstile``
 * dependency can verify it. In dev / CI the token is empty and the backend
 * short-circuits the check.
 *
 * Mirrors apps/myjobhunter/frontend/src/lib/auth.ts.
 */
export async function register(
  email: string,
  password: string,
  displayName?: string,
  turnstileToken = "",
): Promise<void> {
  await api.post<RegisterResponse>(
    "/auth/register",
    {
      email,
      password,
      display_name: displayName?.trim() || null,
    },
    {
      headers: turnstileToken ? { "X-Turnstile-Token": turnstileToken } : {},
    },
  );
}

/**
 * Request a fresh verification email for an unverified account.
 */
export async function requestVerifyToken(email: string): Promise<void> {
  await api.post("/auth/request-verify-token", { email });
}

/**
 * Request a password-reset email. Turnstile token forwarded to backend.
 */
export async function forgotPassword(
  email: string,
  turnstileToken = "",
): Promise<void> {
  await api.post(
    "/auth/forgot-password",
    { email },
    {
      headers: turnstileToken ? { "X-Turnstile-Token": turnstileToken } : {},
    },
  );
}

/**
 * Submit a new password using the token from the reset email.
 */
export async function resetPassword(token: string, password: string): Promise<void> {
  await api.post("/auth/reset-password", { token, password });
}

/**
 * Sign out — clear token, wipe RTK Query caches, notify subscribers.
 */
export function signOut(): void {
  localStorage.removeItem("token");
  store.dispatch(baseApi.util.resetApiState());
  notifyAuthChange();
}
