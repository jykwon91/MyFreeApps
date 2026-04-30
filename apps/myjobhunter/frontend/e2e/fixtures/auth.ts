import type { APIRequestContext } from "@playwright/test";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8002";

export interface TestUser {
  email: string;
  password: string;
}

/**
 * Creates a test user via the backend auth/register endpoint.
 * Returns the created user's credentials for use in tests.
 */
export async function createTestUser(
  request: APIRequestContext,
  overrides: Partial<TestUser> = {}
): Promise<TestUser> {
  const timestamp = Date.now();
  const user: TestUser = {
    email: overrides.email ?? `e2e-test-${timestamp}@myjobhunter-test.invalid`,
    password: overrides.password ?? `TestPass${timestamp}!`,
  };

  const response = await request.post(`${BACKEND_URL}/api/auth/register`, {
    data: { email: user.email, password: user.password },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `Failed to create test user: ${response.status()} — ${body}`
    );
  }

  return user;
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
 * Pattern: test user emails use the ``@myjobhunter-test.invalid`` domain
 * so they are easy to identify and bulk-delete.
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
 * Logs in via the LoginForm UI and waits for the redirect to /dashboard.
 */
export async function loginViaUI(
  page: import("@playwright/test").Page,
  user: TestUser
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 10_000 });
}
