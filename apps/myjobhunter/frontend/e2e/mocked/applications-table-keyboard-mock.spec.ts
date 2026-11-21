/**
 * No-backend E2E: the applications table keeps its table structure (rows of
 * cells under column headers) and opens a row from the keyboard through the
 * real link in its first cell, named by role and company, or by a mouse click
 * on the rest of the row.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockApplication, mockCompany } from "./fixtures/mockData";

const ACME = mockApplication({ id: "app-acme", role_title: "Staff Engineer", company_name: "Acme Corp", latest_status: "applied" });
const GLOBEX = mockApplication({ id: "app-globex", role_title: "Data Scientist", company_name: "Globex", latest_status: "interview" });

async function stubApplications(page: Page): Promise<void> {
  await stubSignedInShell(page);
  await page.route(/\/api\/applications(\?|$)/, (route) => route.fulfill(json({ items: [ACME, GLOBEX], total: 2 })));
  for (const app of [ACME, GLOBEX]) {
    await page.route(new RegExp(`/api/applications/${app.id}$`), (route) =>
      route.fulfill(json({ ...app, events: [], contacts: [] })),
    );
    await page.route(new RegExp(`/api/applications/${app.id}/events`), (route) => route.fulfill(json({ items: [], total: 0 })));
    await page.route(new RegExp(`/api/companies/${app.company_id}$`), (route) => route.fulfill(json(mockCompany({ id: app.company_id }))));
  }
  await page.route(/\/api\/documents(\?|$)/, (route) => route.fulfill(json({ items: [], total: 0 })));
}

test("rows stay table rows and open with Tab and Enter on the first cell's link", async ({ page }) => {
  await stubApplications(page);
  await page.goto("/applications");

  const table = page.getByRole("table");
  await expect(table.getByRole("row")).toHaveCount(3);
  const acmeRow = table.getByRole("row").filter({ hasText: "Acme Corp" });
  const headerCount = await table.getByRole("columnheader").count();
  expect(headerCount).toBeGreaterThan(1);
  await expect(acmeRow.getByRole("cell")).toHaveCount(headerCount);
  await expect(table.getByRole("columnheader", { name: /Company/ })).toBeVisible();

  const open = acmeRow.getByRole("link", { name: "Open Staff Engineer at Acme Corp" });
  await expect(open).toHaveAttribute("href", "/applications/app-acme");
  await expect(acmeRow.getByRole("button")).toHaveCount(0);
  await open.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(open).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(table.getByRole("link", { name: "Open Data Scientist at Globex" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(open).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/applications\/app-acme$/);
});

test("a mouse click elsewhere on a row still opens it", async ({ page }) => {
  await stubApplications(page);
  await page.goto("/applications");

  await page.getByRole("cell", { name: "Data Scientist", exact: true }).click();
  await expect(page).toHaveURL(/\/applications\/app-globex$/);
});
