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
<<<<<<< HEAD
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
=======
 * Deletes the test user via ``DELETE /users/me``.
>>>>>>> origin/main
 *
 * Logs the user in to obtain a JWT, then issues the delete with the
 * three-factor body (TOTP is null because test users never enable 2FA).
 * On any failure, logs a warning instead of throwing so test teardown
 * doesn't mask the real test failure — the periodic cleanup script
 * picks up any survivors:
 *   python backend/scripts/cleanup_test_users.py
 *
 * Pattern: test user emails use the ``@myjobhunter-test.invalid`` domain
 * so they are easy to identify and bulk-delete.
 */
export async function deleteTestUser(
<<<<<<< HEAD
  _request: APIRequestContext,
  _user: TestUser,
): Promise<void> {
  // Phase 1: no delete endpoint yet — document gap
  console.warn(
    "[E2E cleanup] User delete endpoint not available in Phase 1. " +
      `Test user ${_user.email} remains in the dev database. ` +
      "Cleanup manually or wait for Phase 2 user management.",
  );
=======
  request: APIRequestContext,
  user: TestUser
): Promise<void> {
  try {
    const loginResponse = await request.post(`${BACKEND_URL}/api/auth/jwt/login`, {
      form: { username: user.email, password: user.password },
    });
    if (!loginResponse.ok()) {
      // User is already gone (e.g. the test itself deleted it). Nothing to do.
      return;
    }
    const { access_token: token } = await loginResponse.json();

    const deleteResponse = await request.delete(`${BACKEND_URL}/api/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: { password: user.password, confirm_email: user.email, totp_code: null },
    });
    if (!deleteResponse.ok()) {
      const body = await deleteResponse.text();
      console.warn(
        `[E2E cleanup] DELETE /users/me failed for ${user.email}: ` +
          `${deleteResponse.status()} — ${body}`
      );
    }
  } catch (err) {
    console.warn(
      `[E2E cleanup] Failed to delete test user ${user.email}: ${String(err)}`
    );
  }
>>>>>>> origin/main
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
