import api from "@/lib/api";
import { notifyAuthChange } from "@platform/ui";

interface LoginResponse {
  access_token: string;
  token_type: string;
}

interface RegisterResponse {
  id: string;
  email: string;
}

/**
 * Sign in via fastapi-users JWT login.
 * fastapi-users expects application/x-www-form-urlencoded with username + password.
 *
 * Returns successfully only when the user is verified. Unverified accounts
 * receive HTTP 400 with detail="LOGIN_USER_NOT_VERIFIED" — the caller (the
 * Login page) inspects the error to surface a "Resend verification" CTA.
 */
export async function signIn(email: string, password: string): Promise<void> {
  const params = new URLSearchParams();
  params.append("username", email);
  params.append("password", password);

  const response = await api.post<LoginResponse>("/auth/jwt/login", params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  localStorage.setItem("token", response.data.access_token);
  notifyAuthChange();
}

/**
 * Register a new account via fastapi-users.
 *
 * The backend sends a verification email; the new user must click the link
 * before they can log in. We do NOT auto-sign-in after registration — the
 * Login page redirects them to a "check your inbox" notice instead.
 *
 * When a Turnstile token is supplied, it is forwarded as the `X-Turnstile-Token`
 * header so the backend `require_turnstile` dependency can verify it. In dev /
 * CI the token is empty and the backend short-circuits the check.
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
