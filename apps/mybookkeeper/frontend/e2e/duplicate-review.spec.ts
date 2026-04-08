import { test, expect } from "./fixtures/auth";

// Duplicate Review — integrated into Transactions page as a tab
// Source: frontend/src/app/pages/Transactions.tsx

test.describe("Duplicates tab — navigation", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/transactions");
    await page.waitForLoadState("domcontentloaded");
  });

  test("Transactions page has a Duplicates tab", async ({ authedPage: page }) => {
    await expect(page.getByRole("button", { name: /Duplicates/ }).first()).toBeVisible({ timeout: 10000 });
  });

  test("clicking Duplicates tab updates URL to ?tab=duplicates", async ({ authedPage: page }) => {
    await page.getByRole("button", { name: /Duplicates/ }).first().click();
    await expect(page).toHaveURL(/tab=duplicates/, { timeout: 10000 });
  });

  test("direct navigation to ?tab=duplicates shows duplicates view", async ({ authedPage: page }) => {
    await page.goto("/transactions?tab=duplicates");
    await expect(
      page.locator("[class*='border rounded-lg']").first().or(page.getByText(/No suspected duplicates/i))
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Duplicates tab — content", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/transactions?tab=duplicates");
    await expect(
      page.locator("[class*='border rounded-lg']").first().or(page.getByText(/No suspected duplicates/i))
    ).toBeVisible({ timeout: 15000 });
  });

  test("shows either duplicate cards or the empty state", async ({ authedPage: page }) => {
    await expect(
      page.getByText(/days? apart|Same date|Same amount/).first().or(page.getByText(/No suspected duplicates/i))
    ).toBeVisible({ timeout: 15000 });
  });

  test("hides transaction-only actions on duplicates tab", async ({ authedPage: page }) => {
    await expect(page.getByRole("button", { name: "Add Transaction" })).not.toBeVisible();
  });
});

test.describe("Duplicates tab — switching tabs", () => {
  test("switching back to Transactions tab shows the table", async ({ authedPage: page }) => {
    await page.goto("/transactions?tab=duplicates");
    await page.getByRole("button", { name: "Transactions" }).first().click();
    await expect(page).toHaveURL(/\/transactions(?!\?tab)/, { timeout: 10000 });
  });
});


// Inline duplicate indicators — transaction table and panel
test.describe("Inline duplicate indicators", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/transactions");
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
    await expect(
      page.locator("tbody tr").first().or(page.getByText(/no transactions found/i))
    ).toBeVisible({ timeout: 10000 });
  });

  test("transaction table rows show duplicate badge when pairs exist", async ({ authedPage: page }) => {
    // Check if there are any duplicate pairs
    const dupTab = page.getByRole("button", { name: /Duplicates/ }).first();
    await expect(dupTab).toBeVisible({ timeout: 10000 });
    const badge = dupTab.locator("span");
    const hasDuplicates = await badge.count() > 0 && await badge.first().isVisible();

    if (hasDuplicates) {
      // If duplicates exist, at least one row should have the orange duplicate indicator
      await expect(page.locator("tbody tr").locator("[title='Possible duplicate']").first()).toBeVisible({ timeout: 5000 });
    }
    // If no duplicates, no badge should be visible — this is valid behavior
  });

  test("clicking a duplicate-flagged row opens panel with duplicate banner", async ({ authedPage: page }) => {
    const dupIndicator = page.locator("tbody tr").locator("[title='Possible duplicate']").first();
    const hasDuplicates = await dupIndicator.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasDuplicates) {
      // Click the row containing the duplicate indicator
      await dupIndicator.locator("..").locator("..").locator("..").click();
      // Panel should show duplicate warning with Keep/Dismiss actions
      await expect(
        page.getByText("Possible duplicate").last()
      ).toBeVisible({ timeout: 5000 });
      await expect(page.getByRole("button", { name: /keep this one/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /not duplicates/i })).toBeVisible();
    }
  });
});
