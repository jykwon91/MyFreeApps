import type { Page } from "@playwright/test";

/** Stores a sign-in the way the app does, so the next navigation opens signed in. */
export async function storeSession(page: Page, token: string, orgId?: string): Promise<void> {
  await page.goto("/login");
  await page.evaluate(
    ([t, o]) => {
      localStorage.setItem("token", t);
      if (o) localStorage.setItem("v1_activeOrgId", o);
    },
    [token, orgId ?? ""],
  );
}
