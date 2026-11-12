/**
 * Signs a no-backend (fully mocked) E2E spec in. For E2E tests only.
 * Apps pass their own user shape and any extra localStorage entries (an active
 * workspace id, say) rather than keeping a copy of this file.
 */
import type { Page } from "@playwright/test";
import type { CurrentUser } from "@platform/core/types/user/current-user";
import { json } from "./mockResponse";

export const TEST_USER: CurrentUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "test@example.com",
  display_name: "Test User",
  totp_enabled: false,
  is_verified: true,
  is_superuser: false,
};

/**
 * Plants an unexpired (unsigned) JWT under the web platform's "token" key so
 * the auth guard lets the page render, plus any `storage` entries given.
 */
export async function plantAuth(page: Page, storage: Record<string, string> = {}): Promise<void> {
  await page.addInitScript((entries) => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(JSON.stringify({ sub: "test-user", exp: futureExp }));
    window.localStorage.setItem("token", `${header}.${payload}.fake-signature`);
    for (const [key, value] of Object.entries(entries)) window.localStorage.setItem(key, value);
  }, storage);
}

/**
 * Answers every API call a mocked spec does not stub itself with an empty 404,
 * so nothing reaches the (absent) backend through the dev-server proxy.
 * Register it FIRST: Playwright tries the most recently added route first.
 */
export async function stubUnmatchedApi(page: Page): Promise<void> {
  await page.route("**/api/**", (route) => route.fulfill(json({ detail: "Not Found" }, 404)));
}

/** Answers GET /users/me with `user`, in whatever shape the app's backend returns. */
export async function stubCurrentUser(page: Page, user: object = TEST_USER): Promise<void> {
  await page.route("**/api/users/me", (route) => route.fulfill(json(user)));
}

/** Answers unmatched calls with 404, signs in, and answers the shell's /users/me read. */
export async function stubSignedInShell(page: Page, user: object = TEST_USER): Promise<void> {
  await stubUnmatchedApi(page);
  await plantAuth(page);
  await stubCurrentUser(page, user);
}
