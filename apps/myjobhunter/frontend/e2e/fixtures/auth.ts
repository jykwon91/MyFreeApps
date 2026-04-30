import type { APIRequestContext } from "@playwright/test";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8002";

export interface TestUser {
  email: string;
  password: string;
}

/**
 * Creates a test user via the backend auth/register endpoint.
 *
 * Email verification is required before login: this helper auto-verifies
 * the new user via the dev-only test helper if `verify=true` (default).
 * Pass `verify=false` to keep the user unverified — used by the
 * email-verification spec itself.
 *
 * Returns the created user's credentials for use in tests.
 */
export async function createTestUser(
  request: APIRequestContext,
  overrides: Partial<TestUser> & { verify?: boolean } = {},
): Promise<TestUser> {
  const timestamp = Date.now();
  const verify = overrides.verify ?? true;
  const user: TestUser = {
    email:
      overrides.email ?? `e2e-test-${timestamp}@myjobhunter-test.invalid`,
    password: overrides.password ?? `TestPass${timestamp}!`,
  };

  const response = await request.post(`${BACKEND_URL}/api/auth/register`, {
    data: { email: user.email, password: user.password },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `Failed to create test user: ${response.status()} — ${body}`,
    );
  }

  if (verify) {
    await verifyTestUser(request, user.email);
  }

  return user;
}

/**
 * Force-verify a test user by reaching into the backend test helper.
 *
 * The dev/CI flow does NOT actually click the verification link — instead
 * it requests a fresh token via the public resend endpoint and lets the
 * backend log it. The CI environment runs with `EMAIL_BACKEND=console`,
 * which prints the verify URL to stdout. For tests we need a deterministic
 * way to flip the flag without parsing logs, so we hit a small admin SQL
 * helper through the public test-only endpoint exposed in the dev backend.
 *
 * Implementation: post to a backend test endpoint that updates the user
 * row directly. To stay decoupled from a custom endpoint, we instead use
 * the existing `/auth/request-verify-token` to mint a token and read the
 * token from the console-backend log.
 *
 * Simpler approach: piggyback on the dev DB connection by issuing a
 * direct UPDATE through psql in the e2e setup. To avoid that infra
 * dependency, we instead expose a tiny test-only verify-by-email helper
 * gated on the `MYJOBHUNTER_E2E_TEST_HELPER` env var.
 */
async function verifyTestUser(
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const response = await request.post(
    `${BACKEND_URL}/api/_test/verify-email`,
    {
      data: { email },
    },
  );
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `Failed to verify test user ${email}: ${response.status()} — ${body}`,
    );
  }
}

/**
 * Attempts to delete the test user via the backend.
 *
 * NOTE (Phase 1 known gap): The backend does not yet expose a self-delete or
 * admin-delete endpoint. When the endpoint is added in a future phase, implement
 * cleanup here by calling it with the user's JWT token.
 *
 * For now, test users accumulate in the dev database. Run the companion
 * cleanup script periodically:
 *   python backend/scripts/cleanup_test_users.py
 *
 * Pattern: test user emails use the `@myjobhunter-test.invalid` domain so they
 * are easy to identify and bulk-delete.
 */
export async function deleteTestUser(
  _request: APIRequestContext,
  _user: TestUser,
): Promise<void> {
  // Phase 1: no delete endpoint yet — document gap
  console.warn(
    "[E2E cleanup] User delete endpoint not available in Phase 1. " +
      `Test user ${_user.email} remains in the dev database. ` +
      "Cleanup manually or wait for Phase 2 user management.",
  );
}

/**
 * Logs in via the LoginForm UI and waits for the redirect to /dashboard.
 */
export async function loginViaUI(
  page: import("@playwright/test").Page,
  user: TestUser,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 10_000 });
}
