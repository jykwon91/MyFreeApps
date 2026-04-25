import { test, expect } from "./fixtures/auth";

test.describe("Onboarding wizard — layout", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "MyBookkeeper" })).toBeVisible({ timeout: 10000 });
  });

  test("renders the wizard with step indicator", async ({ authedPage: page }) => {
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
    await expect(page.getByText("Your situation")).toBeVisible();
  });

  test("Next button is disabled until a tax situation is selected", async ({ authedPage: page }) => {
    const nextBtn = page.getByRole("button", { name: "Next" });
    await expect(nextBtn).toBeDisabled();
  });

  test("Back button is not visible on step 1", async ({ authedPage: page }) => {
    await expect(page.getByRole("button", { name: "Back" })).not.toBeVisible();
  });
});

test.describe("Onboarding wizard — step navigation", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "MyBookkeeper" })).toBeVisible({ timeout: 10000 });
  });

  test("selecting a tax situation enables Next and advances to step 2", async ({ authedPage: page }) => {
    // Step 1: select a tax situation
    const checkbox = page.getByText(/rental|self-employed|w-2|investment/i).first();
    await checkbox.click();
    const nextBtn = page.getByRole("button", { name: "Next" });
    await expect(nextBtn).toBeEnabled();
    await nextBtn.click();

    // Step 2: filing status
    await expect(page.getByText("Step 2 of 3")).toBeVisible();
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  });

  test("Back button returns to previous step with state preserved", async ({ authedPage: page }) => {
    // Step 1: select something
    const checkbox = page.getByText(/rental|self-employed|w-2|investment/i).first();
    await checkbox.click();
    await page.getByRole("button", { name: "Next" }).click();

    // Step 2: go back
    await expect(page.getByText("Step 2 of 3")).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();

    // Back on step 1 — selection should be preserved (checkbox still checked)
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
  });

  test("navigating through all 3 steps shows Finish setup on last step", async ({ authedPage: page }) => {
    // Step 1: tax situation
    await page.getByText(/rental|self-employed|w-2|investment/i).first().click();
    await page.getByRole("button", { name: "Next" }).click();

    // Step 2: filing status
    await expect(page.getByText("Step 2 of 3")).toBeVisible();
    await page.getByText(/single|married|head of household/i).first().click();
    await page.getByRole("button", { name: "Next" }).click();

    // Step 3: dependents
    await expect(page.getByText("Step 3 of 3")).toBeVisible();
    await expect(page.getByRole("button", { name: "Finish setup" })).toBeVisible();
  });
});
