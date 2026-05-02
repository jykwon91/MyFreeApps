import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginViaUI } from "./fixtures/auth";

test.describe("Companies CRUD", () => {
  test("create a company via the dialog and verify it appears in the list", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);

      // Navigate to Companies
      await page.getByRole("link", { name: /companies/i }).first().click();
      await page.waitForURL("**/companies");

      // Empty state is visible
      await expect(
        page.getByRole("heading", { name: "No companies here yet" }),
      ).toBeVisible();

      // Open the add-company dialog via the empty-state CTA
      await page.getByRole("button", { name: /add a company/i }).click();

      // Dialog is visible
      await expect(
        page.getByRole("dialog", { name: /add company/i }),
      ).toBeVisible();

      // Fill in name (required) and domain
      await page.locator("#ac-name").fill("Test Company Inc");
      await page.locator("#ac-domain").fill("testcompany.example.com");
      await page.locator("#ac-industry").fill("SaaS");

      // Submit
      await page.getByRole("button", { name: /^add company$/i }).click();

      // Dialog closes and success toast appears (scoped to the notifications region
      // to avoid strict mode conflict with the table row that also has the name)
      await expect(
        page.getByRole("region", { name: /notifications/i }).getByText(/Test Company Inc/),
      ).toBeVisible({ timeout: 5_000 });

      // The company appears in the table — use exact text on the name cell
      await expect(
        page.getByRole("button").filter({ hasText: "Test Company Inc" }).first(),
      ).toBeVisible();
      await expect(page.getByText("testcompany.example.com")).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("navigate to company detail and verify fields", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);

      // Navigate to Companies
      await page.getByRole("link", { name: /companies/i }).first().click();
      await page.waitForURL("**/companies");

      // Add a company via dialog
      await page.getByRole("button", { name: /add a company/i }).click();
      await page.locator("#ac-name").fill("Detail Test Corp");
      await page.locator("#ac-domain").fill("detailtest.example.com");
      await page.getByRole("button", { name: /^add company$/i }).click();

      // Wait for the row to appear in the table (the button role row contains the name)
      const detailRow = page.getByRole("button").filter({ hasText: "Detail Test Corp" }).first();
      await expect(detailRow).toBeVisible({ timeout: 5_000 });

      // Click into the detail row
      await detailRow.click();
      await page.waitForURL("**/companies/**");

      // Detail page shows company name as the h1 (exact match avoids h2 "Applications at ...")
      await expect(
        page.getByRole("heading", { name: "Detail Test Corp", exact: true }),
      ).toBeVisible();

      // Domain link is present (strict mode: use the link role to avoid matching the <p> too)
      await expect(page.getByRole("link", { name: "detailtest.example.com" })).toBeVisible();

      // Delete button is present
      await expect(page.getByRole("button", { name: /delete/i })).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("delete a company from the detail page", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);

      await page.getByRole("link", { name: /companies/i }).first().click();
      await page.waitForURL("**/companies");

      // Add a company
      await page.getByRole("button", { name: /add a company/i }).click();
      await page.locator("#ac-name").fill("To Delete Corp");
      await page.getByRole("button", { name: /^add company$/i }).click();

      const deleteRow = page.getByRole("button").filter({ hasText: "To Delete Corp" }).first();
      await expect(deleteRow).toBeVisible({ timeout: 5_000 });

      // Navigate to detail
      await deleteRow.click();
      await page.waitForURL("**/companies/**");

      // Delete — accept the browser confirm dialog
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: /delete/i }).click();

      // Redirected back to companies list
      await page.waitForURL("**/companies", { timeout: 5_000 });

      // The deleted company is no longer in the table (the list is back to empty state)
      await expect(
        page.getByRole("heading", { name: "No companies here yet" }),
      ).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });
});
