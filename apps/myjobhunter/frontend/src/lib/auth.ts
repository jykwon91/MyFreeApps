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
  // Auto sign-in after registration
  await signIn(email, password);
}

/**
 * Sign out — clear token and notify subscribers (triggers RequireAuth redirect).
 */
export function signOut(): void {
  localStorage.removeItem("token");
  notifyAuthChange();
}
