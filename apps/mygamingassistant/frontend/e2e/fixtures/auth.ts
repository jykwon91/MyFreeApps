import type { Page, APIRequestContext } from "@playwright/test";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8004";

/**
 * MGA is a single-user app — there is no /register endpoint. E2E tests
 * log in as the seeded operator user.
 *
 * Credentials are read from env vars so the same test file works in both
 * local dev and CI (where the seed user is pre-created by docker-compose
 * running with SEED_USER_EMAIL + SEED_USER_PASSWORD_HASH).
 *
 * For local dev: set E2E_TEST_EMAIL and E2E_TEST_PASSWORD in your shell
 * to match the values in backend/.env:
 *   export E2E_TEST_EMAIL=admin@example.com
 *   export E2E_TEST_PASSWORD=yourpassword
 */
export interface OperatorCredentials {
  email: string;
  password: string;
}

export function getOperatorCredentials(): OperatorCredentials {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set to the seeded operator credentials. " +
        "See apps/mygamingassistant/CLAUDE.md for setup instructions.",
    );
  }

  return { email, password };
}

/**
 * Resets the backend's in-memory login rate-limit buckets.
 *
 * Call this before every login attempt in E2E tests to prevent the per-IP
 * throttle from triggering when many test runs share the same loopback IP.
 * The endpoint is gated by MGA_ENABLE_TEST_HELPERS=1 and is never mounted
 * in production.
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

interface LoginOptions {
  /**
   * When true, the helper assumes the page is already at /login (e.g.,
   * because the test just clicked a Sign-in CTA on a gated page) and
   * does NOT re-navigate. This preserves the ``state.from`` carried
   * over by react-router-dom, which Login.tsx uses to return the user
   * to the originally-requested page.
   *
   * Defaults to false — most tests start cold and want /login navigation.
   */
  startAtLogin?: boolean;
}

/**
 * Logs in via the login form UI and waits for the redirect away from /login.
 *
 * Resets the backend rate-limit buckets before each login so tests don't
 * interfere with each other when they all share 127.0.0.1 as the client IP.
 *
 * Pass ``{ startAtLogin: true }`` when the page is already on /login from a
 * prior AuthRequired Sign-in click — the helper will preserve the routing
 * state so Login redirects back to the originally-gated page.
 */
export async function loginViaUI(
  page: Page,
  credentials: OperatorCredentials,
  request?: APIRequestContext,
  options: LoginOptions = {},
): Promise<void> {
  if (request) {
    await resetRateLimit(request);
  }
  if (!options.startAtLogin) {
    await page.goto("/login");
  }
  await page.getByLabel(/email/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Wait for navigation away from /login (redirect to / or wherever)
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10_000 });
}
