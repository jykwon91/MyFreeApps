/** Signs a no-backend (fully mocked) spec in as a user of the one test workspace. */
import type { Page } from "@playwright/test";

export const ORG_ID = "00000000-0000-0000-0000-000000000010";

export function plantAuth(page: Page): Promise<void> {
  return page.addInitScript(
    ([orgId]) => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const payload = btoa(JSON.stringify({ sub: "test-user", exp: futureExp }));
      window.localStorage.setItem("token", `${header}.${payload}.fake-signature`);
      window.localStorage.setItem("v1_activeOrgId", orgId);
    },
    [ORG_ID],
  );
}
