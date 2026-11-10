/** Signs a no-backend (fully mocked) spec in as a regular MyJobHunter user. */
import type { Page } from "@playwright/test";
import type { CurrentUser } from "@platform/ui";
import { json } from "./mockResponse";

export const TEST_USER: CurrentUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "test@example.com",
  display_name: "Test User",
  totp_enabled: false,
  is_verified: true,
  is_superuser: false,
};

/** Plants an unexpired (unsigned) JWT so RequireAuth lets the page render. */
export async function plantAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(JSON.stringify({ sub: "test-user", exp: futureExp }));
    window.localStorage.setItem("token", `${header}.${payload}.fake-signature`);
  });
}

/**
 * Answers every API call a mocked spec does not stub itself with an empty 404,
 * so nothing reaches the (absent) backend through the dev-server proxy.
 * Register it FIRST: Playwright tries the most recently added route first.
 */
export async function stubUnmatchedApi(page: Page): Promise<void> {
  await page.route("**/api/**", (route) => route.fulfill(json({ detail: "Not Found" }, 404)));
}

/** Signs in and answers the read the shell makes on every authenticated page. */
export async function stubSignedInShell(page: Page): Promise<void> {
  await stubUnmatchedApi(page);
  await plantAuth(page);
  await page.route("**/api/users/me", (route) => route.fulfill(json(TEST_USER)));
}
