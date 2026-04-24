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
  _user: TestUser
): Promise<void> {
  // Phase 1: no delete endpoint yet — document gap
  console.warn(
    "[E2E cleanup] User delete endpoint not available in Phase 1. " +
    `Test user ${_user.email} remains in the dev database. ` +
    "Cleanup manually or wait for Phase 2 user management."
  );
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
