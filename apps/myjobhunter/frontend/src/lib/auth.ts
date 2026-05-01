import api from "@/lib/api";
import { notifyAuthChange } from "@platform/ui";
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
 * Sign out — clear token and notify subscribers (triggers RequireAuth redirect).
 */
export function signOut(): void {
  localStorage.removeItem("token");
  notifyAuthChange();
}
