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
 *      ``{detail: "totp_required"}`` and the caller is expected to ask the
 *      user for their authenticator code, then call :func:`signIn` again
 *      with ``totpCode`` populated.
 *   3. Unverified email (PR C4) — backend returns HTTP 400 with
 *      ``detail="LOGIN_USER_NOT_VERIFIED"``. The caller surfaces a
 *      "Resend verification email" CTA.
 *
 * The legacy ``/auth/jwt/login`` form-encoded endpoint is no longer the
 * primary login path — it cannot return JWTs for TOTP-enabled users, so the
 * frontend always uses ``POST /auth/totp/login`` (which is also the right
 * endpoint for users without 2FA).
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
    // Wipe RTK Query caches BEFORE notifying — every cached query under
    // the previous user (e.g. /users/me) becomes stale the moment the
    // identity changes. resetApiState clears the cache; the next mount
    // of any component using a query refetches against the new token.
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
 * Login page redirects them to a "check your inbox" notice instead (PR C4).
 *
 * When a Turnstile token is supplied (PR C1), it is forwarded as the
 * ``X-Turnstile-Token`` header so the backend ``require_turnstile``
 * dependency can verify it. In dev / CI the token is empty and the
 * backend short-circuits the check.
 */
export async function register(
  email: string,
  password: string,
  turnstileToken = "",
): Promise<void> {
  await api.post<RegisterResponse>(
    "/auth/register",
    { email, password },
    {
      headers: turnstileToken ? { "X-Turnstile-Token": turnstileToken } : {},
    },
  );
}

/**
 * Request a fresh verification email for an unverified account.
 * The endpoint always returns 202 — even for unknown / already-verified emails —
 * to avoid leaking which addresses are registered.
 */
export async function requestVerifyToken(email: string): Promise<void> {
  await api.post("/auth/request-verify-token", { email });
}

/**
 * Request a password-reset email for ``email``.
 *
 * Backend always returns 202 — even for unknown / unverified emails —
 * so we never leak which addresses are registered. Errors here are
 * deliberately swallowed at the call site so the UI shows the same
 * "check your inbox" affordance for valid + invalid addresses.
 *
 * Turnstile token is forwarded as ``X-Turnstile-Token`` (the backend's
 * ``require_turnstile`` dependency runs on /forgot-password). In dev /
 * CI the token is empty and the backend short-circuits.
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
 *
 * The reset endpoint deliberately has no Turnstile gate — the email-link
 * token is the security control at this step. Failures bubble up so
 * the UI can show "expired link" vs "weak password" vs "network error".
 */
export async function resetPassword(token: string, password: string): Promise<void> {
  await api.post("/auth/reset-password", { token, password });
}

/**
 * Sign out — clear token, wipe RTK Query caches so the next signed-in
 * user doesn't see the previous user's cached data, and notify
 * subscribers (triggers RequireAuth redirect).
 */
export function signOut(): void {
  localStorage.removeItem("token");
  store.dispatch(baseApi.util.resetApiState());
  notifyAuthChange();
}
