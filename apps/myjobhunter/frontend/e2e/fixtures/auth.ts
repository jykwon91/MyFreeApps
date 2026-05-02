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
      overrides.email ?? `e2e-test-${timestamp}@myjobhunter-test.example.com`,
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
 * Force-verify a test user by reaching into the backend test helper
 * (gated by MYJOBHUNTER_ENABLE_TEST_HELPERS=1).
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
 * Deletes the test user via ``DELETE /users/me``.
 *
 * Logs the user in to obtain a JWT, then issues the delete with the
 * three-factor body (TOTP is null because test users never enable 2FA).
 * On any failure, logs a warning instead of throwing so test teardown
 * doesn't mask the real test failure — the periodic cleanup script
 * picks up any survivors:
 *   python backend/scripts/cleanup_test_users.py
 *
 * Pattern: test user emails use the ``@myjobhunter-test.example.com`` domain
 * (RFC 2606 reserved, accepted by email validators) so they are easy to identify
 * and bulk-delete.
 */
export async function deleteTestUser(
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
}

/**
 * Resets the backend's in-memory login rate-limit buckets.
 *
 * Call this before every login attempt in E2E tests to prevent the per-IP
 * throttle from triggering when many test runs share the same loopback IP.
 * The endpoint is gated by MYJOBHUNTER_ENABLE_TEST_HELPERS=1 and is never
 * mounted in production.
 */
export async function resetRateLimit(
  request: APIRequestContext,
): Promise<void> {
  const response = await request.post(`${BACKEND_URL}/api/_test/reset-rate-limit`);
  if (!response.ok()) {
    // Non-fatal — warn but don't abort the test.
    console.warn(
      `[E2E] reset-rate-limit failed: ${response.status()} — endpoint may not be mounted`,
    );
  }
}

/**
 * Logs in via the LoginForm UI and waits for the redirect to /dashboard.
 *
 * Resets the backend rate-limit buckets before each login so tests don't
 * interfere with each other when they all share 127.0.0.1 as the client IP.
 */
export async function loginViaUI(
  page: import("@playwright/test").Page,
  user: TestUser,
  request?: APIRequestContext,
): Promise<void> {
  if (request) {
    await resetRateLimit(request);
  }
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  // Use the input's id directly to avoid matching the 'Show password' toggle button
  // (which also has 'password' in its aria-label).
  await page.locator("#login-password").fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Wait for navigation away from /login — the redirect target may be /dashboard
  // (first login) or whatever page the user last visited (returning session).
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10_000 });
}
