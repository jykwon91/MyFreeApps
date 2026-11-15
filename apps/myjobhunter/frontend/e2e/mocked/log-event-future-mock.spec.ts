/**
 * No-backend E2E for logging an event: a "When" in the future is refused with
 * a field error and nothing is sent; a "When" of now goes through. The
 * interview's own time has its own field, so it stays free to be in the future.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockApplication, mockCompany } from "./fixtures/mockData";

const APPLICATION = mockApplication();
const EVENTS = new RegExp(`/api/applications/${APPLICATION.id}/events`);
const NEXT_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FUTURE_ERROR = "This can't be in the future. For an upcoming interview, put its time in the interview date field.";

/** A local wall-clock "YYYY-MM-DDTHH:mm" a week ahead, as a datetime-local input takes it. */
function nextWeekLocal(): string {
  const date = new Date(Date.now() + NEXT_WEEK_MS);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function stubApplication(page: Page): Promise<unknown[]> {
  const posted: unknown[] = [];
  await stubSignedInShell(page);
  await page.route(new RegExp(`/api/applications/${APPLICATION.id}$`), (route) =>
    route.fulfill(json({ ...APPLICATION, events: [], contacts: [] })),
  );
  await page.route(EVENTS, (route) => {
    if (route.request().method() !== "POST") return route.fulfill(json({ items: [], total: 0 }));
    posted.push(route.request().postDataJSON());
    return route.fulfill(json({ id: "e-1", ...(route.request().postDataJSON() as object) }, 201));
  });
  await page.route(/\/api\/documents(\?|$)/, (route) => route.fulfill(json({ items: [], total: 0 })));
  await page.route(new RegExp(`/api/companies/${APPLICATION.company_id}$`), (route) => route.fulfill(json(mockCompany())));
  return posted;
}

test("a future 'When' is refused and nothing is sent", async ({ page }) => {
  const posted = await stubApplication(page);
  await page.goto(`/applications/${APPLICATION.id}`);

  await page.getByRole("button", { name: "Log event" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Log event" });
  await dialog.getByLabel(/^When/).fill(nextWeekLocal());
  await dialog.getByRole("button", { name: "Log event" }).click();

  await expect(dialog.getByText(FUTURE_ERROR)).toBeVisible();
  expect(posted).toHaveLength(0);
});

test("a 'When' of now is logged", async ({ page }) => {
  const posted = await stubApplication(page);
  await page.goto(`/applications/${APPLICATION.id}`);

  await page.getByRole("button", { name: "Log event" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Log event" });
  await dialog.getByRole("button", { name: "Log event" }).click();

  await expect(page.getByText("Event logged", { exact: true })).toBeVisible();
  expect(posted).toHaveLength(1);
});
