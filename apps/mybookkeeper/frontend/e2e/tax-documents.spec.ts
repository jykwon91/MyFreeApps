import { test, expect } from "./fixtures/auth";
import { BACKEND_URL } from "./fixtures/config";

test.describe("Tax Documents — navigation", () => {
  test("sidebar has a Tax Documents link", async ({ authedPage: page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Tax Documents" })).toBeVisible();
  });

  test("clicking the Tax Documents sidebar link navigates to /tax-documents", async ({ authedPage: page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Tax Documents" }).click();
    await expect(page).toHaveURL(/tax-documents/);
  });
});

test.describe("Tax Documents — accordion layout", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/tax-documents");
    await expect(page.getByRole("heading", { name: "Tax Documents" })).toBeVisible();
    // Wait for content to load
    await page.waitForTimeout(3000);
  });

  test("renders the Tax Documents page title", async ({ authedPage: page }) => {
    await expect(page.getByRole("heading", { name: "Tax Documents" })).toBeVisible();
  });

  test("shows grouped documents or empty state", async ({ authedPage: page }) => {
    // Page should show either W-2/1099 form type badges or the empty state
    const hasFormTypes = await page.getByText("W-2").first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no tax documents/i).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasFormTypes || hasEmpty).toBe(true);
  });

  test("year groups show document count badge", async ({ authedPage: page }) => {
    const hasData = await page.getByText("2025").isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasData) {
      test.skip(true, "No 2025 tax documents available");
      return;
    }
    await expect(page.getByText("2025").locator("..").getByText(/\d+/)).toBeVisible();
  });

  test("form type groups are visible within expanded year", async ({ authedPage: page }) => {
    const hasData = await page.getByText("2025").isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasData) {
      test.skip(true, "No 2025 tax documents available");
      return;
    }
    await expect(
      page.getByText("W-2").first()
        .or(page.getByText("1099-MISC").first())
        .or(page.getByText("1098").first())
    ).toBeVisible({ timeout: 5000 });
  });

  test("issuer names are visible within expanded form type group", async ({ authedPage: page }) => {
    const hasData = await page.getByText("2025").isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasData) {
      test.skip(true, "No 2025 tax documents available");
      return;
    }
    await expect(
      page.getByText(/LLC|Inc|Bank|Credit Union/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("View button opens document viewer", async ({ authedPage: page }) => {
    const viewBtn = page.getByRole("button", { name: /view/i }).first();
    const hasView = await viewBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasView) {
      test.skip(true, "No View button available — no documents");
      return;
    }
    await viewBtn.click();
    await expect(page.getByText("Source document")).toBeVisible({ timeout: 5000 });
  });

  test("year selector is visible", async ({ authedPage: page }) => {
    const yearSelect = page.locator("select").first();
    const hasSelect = await yearSelect.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasSelect) {
      test.skip(true, "No year selector visible");
      return;
    }
    const options = await yearSelect.locator("option").allTextContents();
    expect(options.some(o => o.includes("All"))).toBe(true);
  });

  test("document checklist section or empty state is visible", async ({ authedPage: page }) => {
    const hasChecklist = await page.getByText(/checklist/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasMissing = await page.getByText(/missing/i).first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no tax documents/i).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasChecklist || hasMissing || hasEmptyState).toBe(true);
  });
});
