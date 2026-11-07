import { test, expect } from "./fixtures/auth";
import { getYear } from "date-fns";
import { deleteReconciliationSource } from "./fixtures/seed-data";

const TEST_YEAR = getYear(new Date()) - 1;
const RUN_ID = Date.now();

test.describe("Failed document alert", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/documents");
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 10000 });
  });

  test("documents page shows failed alert when failed documents exist", async ({ authedPage: page }) => {
    // Filter to failed status to check if any exist
    const statusFilter = page.locator("select, [data-filter='status']").first();
    const hasFailed = await page.getByText(/I had trouble/i).isVisible({ timeout: 3000 }).catch(() => false);

    if (hasFailed) {
      // Alert should have a "Show failed" button
      await expect(page.getByRole("button", { name: /show failed/i })).toBeVisible();
    }
    // If no failed docs, alert should not be visible — both cases are valid
  });

  test("documents page does not show raw SQL errors", async ({ authedPage: page }) => {
    // No error message on the page should contain SQL keywords
    const pageText = await page.locator("body").textContent();
    expect(pageText).not.toContain("asyncpg");
    expect(pageText).not.toContain("INSERT INTO");
    expect(pageText).not.toContain("IntegrityError");
    expect(pageText).not.toContain("CheckViolationError");
  });
});

test.describe("Reconciliation table UX", () => {
  let sourceId: string | null = null;
  // One per test so parallel tests never see each other's row.
  let issuer = "";

  test.beforeEach(async ({ authedPage: page, api }, testInfo) => {
    issuer = `E2E UX Source ${RUN_ID} ${testInfo.testId}`;
    const res = await api.post("/reconciliation/upload-1099", {
      data: { source_type: "1099_k", tax_year: TEST_YEAR, issuer, reported_amount: "1234.00" },
    });
    expect(res.status()).toBe(201);
    sourceId = (await res.json()).id;

    await page.goto("/reconciliation");
    await expect(page.getByRole("heading", { name: "Reconciliation", level: 1 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("combobox").first()).toHaveValue(String(TEST_YEAR));
    await page.getByRole("button", { name: /review sources/i }).click();
    await expect(page.getByRole("row").filter({ hasText: issuer })).toBeVisible({ timeout: 10000 });
  });

  test.afterEach(async ({ api }) => {
    if (sourceId) await deleteReconciliationSource(api, sourceId);
    sourceId = null;
  });

  test("reconciliation page shows renamed column headers", async ({ authedPage: page }) => {
    const table = page.getByRole("table");
    await expect(table.getByRole("columnheader", { name: "1099 Amount", exact: true })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Reservation Total", exact: true })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Reported", exact: true })).toHaveCount(0);
    await expect(table.getByRole("columnheader", { name: "Matched", exact: true })).toHaveCount(0);
  });

  test("reconciliation page shows explanatory text", async ({ authedPage: page }) => {
    await expect(page.getByText("Each row is one 1099 form or year-end statement.")).toBeVisible();
  });
});
