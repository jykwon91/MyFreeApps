/**
 * Stubs the shared account endpoint, /users/me, the way platform_shared answers
 * it. For E2E tests only.
 *
 * GET answers the current user; a PATCH (display name) merges its body into the
 * user and answers it; a DELETE (account deletion) answers 204. Each write is
 * recorded, and when `refuse` is given it is refused that way instead (a
 * status with a JSON `detail`, or with a plain-text body), the user left as it was.
 */
import type { Page } from "@playwright/test";
import type { CurrentUser } from "@platform/core/types/user/current-user";
import { DEFAULT_API_BASE } from "./constants/defaultApiBase";
import { escapeRegExp } from "./escapeRegExp";
import { json, plainText } from "./mockResponse";
import { TEST_USER } from "./mockSession";
import { recordWrite } from "./recordWrite";
import type { AccountApiStubOptions } from "./types/AccountApiStubOptions";
import type { SentRequest } from "./types/SentRequest";

export const ME_PATH = "/users/me";

export async function stubAccountApi<TUser extends object = CurrentUser>(
  page: Page,
  { user, refuse, apiBase = DEFAULT_API_BASE }: AccountApiStubOptions<TUser> = {},
): Promise<SentRequest[]> {
  const sent: SentRequest[] = [];
  let current: object = user ?? TEST_USER;
  await page.route(new RegExp(`${escapeRegExp(apiBase + ME_PATH)}$`), (route) => {
    const request = route.request();
    const method = request.method();
    if (method === "GET") return route.fulfill(json(current));
    const body = recordWrite(sent, request, apiBase);
    if (refuse) {
      const refusal =
        "plainText" in refuse ? plainText(refuse.plainText, refuse.status) : json({ detail: refuse.detail }, refuse.status);
      return route.fulfill(refusal);
    }
    if (method === "PATCH") {
      current = { ...current, ...(body as object) };
      return route.fulfill(json(current));
    }
    return route.fulfill({ status: 204 });
  });
  return sent;
}
