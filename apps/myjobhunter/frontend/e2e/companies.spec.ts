import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginViaUI } from "./fixtures/auth";

test.describe("Companies CRUD", () => {
  test("create a company via the dialog and verify it appears in the list", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user);

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
      await page.getByLabel(/name/i).fill("Test Company Inc");
      await page.getByLabel(/domain/i).fill("testcompany.example.com");
      await page.getByLabel(/industry/i).fill("SaaS");

      // Submit
      await page.getByRole("button", { name: /^add company$/i }).click();

      // Dialog closes and success toast appears
      await expect(
        page.getByText(/Test Company Inc.*added|added.*Test Company Inc/i),
      ).toBeVisible({ timeout: 5_000 });

      // The company appears in the table
      await expect(page.getByText("Test Company Inc")).toBeVisible();
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
      await loginViaUI(page, user);

      // Navigate to Companies
      await page.getByRole("link", { name: /companies/i }).first().click();
      await page.waitForURL("**/companies");

      // Add a company via dialog
      await page.getByRole("button", { name: /add a company/i }).click();
      await page.getByLabel(/name/i).fill("Detail Test Corp");
      await page.getByLabel(/domain/i).fill("detailtest.example.com");
      await page.getByRole("button", { name: /^add company$/i }).click();

      await expect(page.getByText("Detail Test Corp")).toBeVisible({ timeout: 5_000 });

      // Click into the detail row
      await page.getByText("Detail Test Corp").click();
      await page.waitForURL("**/companies/**");

      // Detail page shows company name
      await expect(
        page.getByRole("heading", { name: "Detail Test Corp" }),
      ).toBeVisible();

      // Domain link is present
      await expect(page.getByText("detailtest.example.com")).toBeVisible();

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
      await loginViaUI(page, user);

      await page.getByRole("link", { name: /companies/i }).first().click();
      await page.waitForURL("**/companies");

      // Add a company
      await page.getByRole("button", { name: /add a company/i }).click();
      await page.getByLabel(/name/i).fill("To Delete Corp");
      await page.getByRole("button", { name: /^add company$/i }).click();

      await expect(page.getByText("To Delete Corp")).toBeVisible({ timeout: 5_000 });

      // Navigate to detail
      await page.getByText("To Delete Corp").click();
      await page.waitForURL("**/companies/**");

      // Delete — accept the browser confirm dialog
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: /delete/i }).click();

      // Redirected back to companies list
      await page.waitForURL("**/companies", { timeout: 5_000 });

      // The deleted company is no longer in the list
      await expect(page.getByText("To Delete Corp")).not.toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });
});
