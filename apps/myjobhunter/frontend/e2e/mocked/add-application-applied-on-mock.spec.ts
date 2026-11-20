/**
 * No-backend E2E for the Add application dialog's "Applied on" day: it starts
 * at today, a backdated day is sent as `applied_at` at that day's local
 * midnight, and a day in the future is refused with nothing sent.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockApplication, mockCompany } from "./fixtures/mockData";

const COMPANY = mockCompany();
const APPLICATIONS_ENDPOINT = /\/api\/applications(\?|$)/;
const COMPANIES_ENDPOINT = /\/api\/companies(\?|$)/;
const FUTURE_ERROR = "The day you applied can't be in the future.";

// A fixed zone west of UTC, where reading the day through UTC would be off by one.
test.use({ timezoneId: "America/Chicago" });

async function stubAddFlow(page: Page): Promise<Array<Record<string, unknown>>> {
  const posted: Array<Record<string, unknown>> = [];
  await stubSignedInShell(page);
  await page.route(COMPANIES_ENDPOINT, (route) => route.fulfill(json({ items: [COMPANY], total: 1 })));
  await page.route(/\/api\/companies\/[^/]+\/research/, (route) => route.fulfill(json({}, 202)));
  await page.route(APPLICATIONS_ENDPOINT, (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fulfill(json({ items: [], total: 0 }));
    const payload = request.postDataJSON() as Record<string, unknown>;
    posted.push(payload);
    return route.fulfill(json(mockApplication({ id: "new-1", applied_at: String(payload.applied_at) }), 201));
  });
  return posted;
}

/** Opens the dialog, picks the tracked company by hand, and types a role title. */
async function openManualReview(page: Page) {
  await page.goto("/applications");
  await page.getByRole("button", { name: "Add application" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add application" });
  await dialog.getByText(/adding manually\? type a company name/i).click();
  await dialog.getByLabel("Company name").fill(COMPANY.name);
  await dialog.getByLabel("Company name").press("Enter");
  await expect(dialog.getByText(/review and adjust before saving/i)).toBeVisible();
  await dialog.getByPlaceholder("e.g. Senior Backend Engineer").fill("Staff Engineer");
  return dialog;
}

/** A local "YYYY-MM-DD" `days` from today in the page's time zone, and that day's local midnight as ISO. */
async function localDay(page: Page, days: number): Promise<{ day: string; midnightIso: string }> {
  return page.evaluate((offset) => {
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      day: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      midnightIso: date.toISOString(),
    };
  }, days);
}

test("a backdated 'Applied on' is sent as applied_at", async ({ page }) => {
  const posted = await stubAddFlow(page);
  const dialog = await openManualReview(page);
  const today = await localDay(page, 0);
  const twoWeeksAgo = await localDay(page, -14);

  const appliedOn = dialog.getByLabel(/^Applied on/);
  await expect(appliedOn).toHaveValue(today.day);
  await appliedOn.fill(twoWeeksAgo.day);
  await dialog.getByRole("button", { name: "Add application" }).click();

  await expect(page.getByText("Application added", { exact: true })).toBeVisible();
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ company_id: COMPANY.id, role_title: "Staff Engineer", applied_at: twoWeeksAgo.midnightIso });
});

test("an 'Applied on' in the future is refused and nothing is sent", async ({ page }) => {
  const posted = await stubAddFlow(page);
  const dialog = await openManualReview(page);
  const tomorrow = await localDay(page, 1);

  await dialog.getByLabel(/^Applied on/).fill(tomorrow.day);
  await dialog.getByRole("button", { name: "Add application" }).click();

  await expect(dialog.getByText(FUTURE_ERROR)).toBeVisible();
  expect(posted).toHaveLength(0);
});
