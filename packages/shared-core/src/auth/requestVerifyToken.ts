import api from "../lib/api";

/**
 * Ask for a fresh verification email for an unverified account. The backend
 * answers 202 even for unknown or already-verified emails, so it never leaks
 * which addresses are registered. Failures (a rate limit, no connection) reject.
 *
 * `timeoutMs` is for callers that want a shorter wait than the API client's own
 * default, such as a phone.
 */
export async function requestVerifyToken(email: string, timeoutMs?: number): Promise<void> {
  await api.post("/auth/request-verify-token", { email }, { timeout: timeoutMs });
}
