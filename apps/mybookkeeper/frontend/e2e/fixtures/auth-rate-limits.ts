import { BACKEND_URL } from "./config";

/**
 * Clear the backend's per-IP sign-in, sign-up and password-reset limits.
 *
 * Every request in a run comes from one IP, so call this right before a spec
 * signs in or signs up for real; otherwise it inherits whatever the specs
 * before it spent (10 sign-ins per 5 minutes, 5 sign-ups an hour).
 */
export async function resetAuthRateLimits(): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/test/reset-auth-rate-limits`, { method: "POST" });
  if (!res.ok) {
    throw new Error(
      `E2E: couldn't reset the sign-in limits (${res.status}). The backend needs ALLOW_TEST_ADMIN_PROMOTION=true.`,
    );
  }
}
