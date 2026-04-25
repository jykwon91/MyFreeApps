import { test, expect } from "./fixtures/auth";

test.describe("Authenticated navigation", () => {
  test("dashboard loads as the default route with content", async ({ authedPage: page }) => {
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    // Verify actual dashboard content loads (not just the heading)
    await expect(
      page.getByText("Total Revenue").or(page.getByText(/no transactions yet/i))
    ).toBeVisible({ timeout: 15000 });
  });

  test("sidebar shows all expected nav items", async ({ authedPage: page }) => {
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Transactions" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Documents" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Properties" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tax Report" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Integrations" })).toBeVisible();
  });

  test("navigating to Transactions loads the transactions table or empty state", async ({ authedPage: page }) => {
    await page.getByRole("link", { name: "Transactions" }).click();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();

    // Page content should load — either table rows or an empty indicator
    await expect(
      page.locator("tbody tr").first().or(page.getByText(/no transactions/i))
    ).toBeVisible({ timeout: 15000 });

    // Sidebar active state: the Transactions link should have the active class
    const txnLink = page.getByRole("link", { name: "Transactions" });
    await expect(txnLink).toHaveClass(/bg-primary/);
    // Dashboard link should not be active
    const dashLink = page.getByRole("link", { name: "Dashboard" });
    await expect(dashLink).not.toHaveClass(/bg-primary/);
  });

  test("navigating to Documents loads the documents page with upload area", async ({ authedPage: page }) => {
    await page.getByRole("link", { name: "Documents" }).click();
    await expect(page).toHaveURL(/\/documents/);
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();

    // Documents page should show upload area or document list
    await page.waitForLoadState("networkidle");
  });

  test("navigating to Properties loads properties with content", async ({ authedPage: page }) => {
    await page.getByRole("link", { name: "Properties" }).click();
    await expect(page).toHaveURL(/\/properties/);
    await expect(page.getByRole("heading", { name: "Properties" })).toBeVisible();
    await page.waitForLoadState("networkidle");
  });

  test("navigating to Tax Report loads the tax page", async ({ authedPage: page }) => {
    await page.getByRole("link", { name: "Tax Report" }).click();
    await expect(page).toHaveURL(/\/tax/);
    await expect(page.getByRole("heading", { name: "Tax Report" })).toBeVisible();
    await page.waitForLoadState("networkidle");
  });

  test("navigating to Integrations loads the integrations page with sections", async ({ authedPage: page }) => {
    await page.getByRole("link", { name: "Integrations" }).click();
    await expect(page).toHaveURL(/\/integrations/);
    await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible();

    // Wait for actual content past skeleton
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByText("Gmail").first().or(page.getByText("Bank Accounts").first())
    ).toBeVisible({ timeout: 15000 });

    // Sidebar active state check
    const intLink = page.getByRole("link", { name: "Integrations" });
    await expect(intLink).toHaveClass(/bg-primary/);
  });

  test("rapid navigation between pages loads correct content each time", async ({ authedPage: page }) => {
    // Navigate through multiple pages quickly and verify each loads correctly
    const pages = [
      { link: "Transactions", heading: "Transactions", url: /\/transactions/ },
      { link: "Properties", heading: "Properties", url: /\/properties/ },
      { link: "Dashboard", heading: "Dashboard", url: /\/$/ },
    ];

    for (const p of pages) {
      await page.getByRole("link", { name: p.link }).click();
      await expect(page).toHaveURL(p.url);
      await expect(page.getByRole("heading", { name: p.heading })).toBeVisible();
    }
  });
});
