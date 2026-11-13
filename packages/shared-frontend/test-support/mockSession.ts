/**
 * Signs a no-backend (fully mocked) E2E spec in. For E2E tests only.
 *
 * Every web app's auth is shared (@platform/ui auth pages, platform_shared
 * routes), so the "signed-in shell" is the same everywhere: a token the auth
 * guard accepts and an answer to GET /users/me. Apps pass their own user shape,
 * localStorage entries (an active workspace id, say) and any other reads their
 * signed-in pages make, rather than keeping a copy of this file.
 *
 * test-support/package.json says `"type": "module"` because shared-frontend's
 * own package.json has no "type", so Node would load these files as CommonJS.
 * The apps are ES modules, and importing a named export (defineMockedConfig,
 * stubSignedInShell, ...) from a CommonJS file fails before any test runs.
 */
import type { Page } from "@playwright/test";
import type { CurrentUser } from "@platform/core/types/user/current-user";
import { DEFAULT_API_BASE } from "./constants/defaultApiBase";
import { json } from "./mockResponse";
import { unsignedJwt } from "./unsignedJwt";
import type { ApiBaseOption } from "./types/ApiBaseOption";
import type { ShellRoute } from "./types/ShellRoute";
import type { SignedInShellOptions } from "./types/SignedInShellOptions";
import type { UnmatchedApiOptions } from "./types/UnmatchedApiOptions";

/** GET /users/me as the shared-auth apps' UserRead sends it (fastapi-users BaseUser plus display_name and totp_enabled). */
export const TEST_USER: CurrentUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "test@example.com",
  display_name: "Test User",
  totp_enabled: false,
  is_verified: true,
  is_superuser: false,
};

/** The glob page.route() matches for `path` under the app's API base. */
function apiUrl(path: string, apiBase: string = DEFAULT_API_BASE): string {
  return `**${apiBase}${path}`;
}

/**
 * Plants an unexpired (unsigned) JWT under the web platform's "token" key so
 * the auth guard lets the page render, plus any `storage` entries given.
 */
export async function plantAuth(page: Page, storage: Record<string, string> = {}): Promise<void> {
  await page.addInitScript(
    ({ token, entries }) => {
      window.localStorage.setItem("token", token);
      for (const [key, value] of Object.entries(entries)) window.localStorage.setItem(key, value);
    },
    { token: unsignedJwt(), entries: storage },
  );
}

/**
 * Answers every API call a mocked spec does not stub itself, so nothing reaches
 * the (absent) backend through the dev-server proxy: a 404 by default, or an
 * empty answer (see UnmatchedAnswer). Register it FIRST: Playwright tries the
 * most recently added route first.
 */
export async function stubUnmatchedApi(
  page: Page,
  { apiBase, answer = "notFound" }: UnmatchedApiOptions = {},
): Promise<void> {
  await page.route(apiUrl("/**", apiBase), (route) =>
    route.fulfill(
      answer === "notFound"
        ? json({ detail: "Not Found" }, 404)
        : json(route.request().method() === "GET" ? [] : {}),
    ),
  );
}

/** Answers GET /users/me with `user`, in whatever shape the app's backend returns. */
export async function stubCurrentUser<TUser extends object = CurrentUser>(
  page: Page,
  user: TUser,
  { apiBase }: ApiBaseOption = {},
): Promise<void> {
  await page.route(apiUrl("/users/me", apiBase), (route) => route.fulfill(json(user)));
}

/** Answers each route's path under the API base with its fixed body. */
export async function stubJsonRoutes(
  page: Page,
  routes: ShellRoute[],
  { apiBase }: ApiBaseOption = {},
): Promise<void> {
  for (const { path, body, status } of routes) {
    await page.route(apiUrl(path, apiBase), (route) => route.fulfill(json(body, status)));
  }
}

/**
 * Answers unmatched calls, signs in, and answers the shell's reads: /users/me
 * plus any app-specific `routes`. Register the spec's own stubs after this, so
 * they win over the catch-all.
 */
export async function stubSignedInShell<TUser extends object = CurrentUser>(
  page: Page,
  { user, apiBase, storage, routes = [], unmatched }: SignedInShellOptions<TUser> = {},
): Promise<void> {
  await stubUnmatchedApi(page, { apiBase, answer: unmatched });
  await plantAuth(page, storage);
  await stubCurrentUser(page, user ?? TEST_USER, { apiBase });
  await stubJsonRoutes(page, routes, { apiBase });
}
