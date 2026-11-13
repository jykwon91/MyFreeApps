/**
 * Stubs the shared sign-in route. For E2E tests only.
 *
 * POST /auth/totp/login answers `reply` with `status`; the returned array
 * collects every body the login page sent, for the spec to assert on.
 */
import type { Page } from "@playwright/test";
import { LOGIN_ENDPOINT } from "./constants/loginEndpoint";
import { json } from "./mockResponse";

export async function stubLogin(page: Page, reply: unknown, status = 200): Promise<unknown[]> {
  const sent: unknown[] = [];
  await page.route(LOGIN_ENDPOINT, (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill(json(reply, status));
  });
  return sent;
}
