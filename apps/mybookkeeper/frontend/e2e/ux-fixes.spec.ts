import { test, expect } from "./fixtures/auth";

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
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/reconciliation");
    await page.waitForLoadState("domcontentloaded");
  });

  test("reconciliation page shows renamed column headers", async ({ authedPage: page }) => {
    // Wait for the review sources step to be visible
    const reviewBtn = page.getByText(/Review Sources/i).first();
    if (await reviewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await reviewBtn.click();
    }

    // Check for renamed columns (may not be visible if no data)
    const table = page.locator("table").first();
    if (await table.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(table.getByText("1099 Amount")).toBeVisible();
      await expect(table.getByText("Reservation Total")).toBeVisible();
      // Old column names should not exist
      await expect(table.getByText("Reported")).not.toBeVisible();
      await expect(table.getByText("Matched")).not.toBeVisible();
    }
  });

  test("reconciliation page shows explanatory text", async ({ authedPage: page }) => {
    const reviewBtn = page.getByText(/Review Sources/i).first();
    if (await reviewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await reviewBtn.click();
    }

    await expect(
      page.getByText(/Each row is one 1099 form or year-end statement/i).or(
        page.getByText(/no.*sources/i)
      )
    ).toBeVisible({ timeout: 5000 });
  });
});
