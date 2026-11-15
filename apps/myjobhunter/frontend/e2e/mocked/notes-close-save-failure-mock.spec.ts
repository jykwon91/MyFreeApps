/**
 * No-backend E2E: closing the application drawer inside the notes autosave
 * debounce window saves the edit, and when that save fails the user is told on
 * the toaster (which outlives the drawer).
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockApplication, mockCompany } from "./fixtures/mockData";

const APPLICATION = mockApplication();
const DETAIL = new RegExp(`/api/applications/${APPLICATION.id}$`);

test("closing the drawer right after typing notes warns when the final save fails", async ({ page }) => {
  await stubSignedInShell(page);
  const patched: unknown[] = [];
  await page.route(DETAIL, (route) => {
    if (route.request().method() === "PATCH") {
      patched.push(route.request().postDataJSON());
      return route.fulfill(json({ detail: "Server error" }, 500));
    }
    return route.fulfill(json({ ...APPLICATION, events: [], contacts: [] }));
  });
  await page.route(new RegExp(`/api/applications/${APPLICATION.id}/events`), (route) =>
    route.fulfill(json({ items: [], total: 0 })),
  );
  await page.route(/\/api\/documents(\?|$)/, (route) => route.fulfill(json({ items: [], total: 0 })));
  await page.route(new RegExp(`/api/companies/${APPLICATION.company_id}$`), (route) => route.fulfill(json(mockCompany())));
  await page.route(/\/api\/applications\?view=kanban/, (route) => route.fulfill(json({ items: [], total: 0 })));

  await page.goto(`/dashboard?app=${APPLICATION.id}`);
  await page.getByLabel("Application notes").fill("last-minute thought");
  await page.keyboard.press("Escape");

  await expect(page.getByText(/Your last notes edit wasn't saved: /)).toBeVisible();
  expect(patched).toEqual([{ notes: "last-minute thought" }]);
});
