/**
 * No-backend E2E: once an application is deleted the server reports its documents with no
 * link, so going back to Documents (still cached from a moment ago) reloads it and the
 * document no longer offers an "Application" link to a page that would say it can't be found.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockApplication, mockCompany, mockDocument } from "./fixtures/mockData";

const APPLICATION = mockApplication();
const DETAIL = new RegExp(`/api/applications/${APPLICATION.id}$`);

test("after deleting an application, Documents keeps its letter but drops the dead Application link", async ({ page }) => {
  await stubSignedInShell(page);
  let deleted = false;
  const letter = () => mockDocument({ title: "Acme letter", application_id: deleted ? null : APPLICATION.id });
  await page.route(/\/api\/documents(\?|$)/, (route) => {
    const forApplication = new URL(route.request().url()).searchParams.get("application_id");
    const items = forApplication !== null && deleted ? [] : [letter()];
    return route.fulfill(json({ items, total: items.length }));
  });
  await page.route(DETAIL, (route) => {
    if (route.request().method() === "DELETE") {
      deleted = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill(json({ ...APPLICATION, events: [], contacts: [] }));
  });
  await page.route(new RegExp(`/api/applications/${APPLICATION.id}/events`), (route) => route.fulfill(json({ items: [], total: 0 })));
  await page.route(new RegExp(`/api/companies/${APPLICATION.company_id}$`), (route) => route.fulfill(json(mockCompany())));
  await page.route(/\/api\/applications\?view=kanban/, (route) => route.fulfill(json({ items: [], total: 0 })));

  await page.goto("/documents");
  await expect(page.getByText("Acme letter")).toBeVisible();
  await page.getByRole("link", { name: "Application", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Staff Engineer" })).toBeVisible();
  // The Documents section below has a per-row Delete button too, so scope to the page header.
  await page.locator("header").getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("link", { name: "Documents" }).first().click();
  await expect(page.getByText("Acme letter")).toBeVisible();
  await expect(page.getByRole("link", { name: "Application", exact: true })).toHaveCount(0);
});
