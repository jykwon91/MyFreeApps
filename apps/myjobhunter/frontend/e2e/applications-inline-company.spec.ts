/**
 * E2E: Inline company creation from AddApplicationDialog.
 *
 * Covers the new flow: user opens "Add application" dialog, clicks "+ New"
 * next to the company dropdown, fills in a company name, submits the inline
 * form, and the new company auto-selects in the application dropdown so the
 * user can complete the application without leaving the dialog.
 */
import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginViaUI } from "./fixtures/auth";

test.describe("Applications — inline company create", () => {
  test("create a company inline from the add-application dialog, then submit the application", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user);

      // Navigate to Applications
      await page.getByRole("link", { name: /applications/i }).first().click();
      await page.waitForURL("**/applications");

      // Empty state with "Add application" CTA
      await expect(
        page.getByRole("heading", { name: "No applications yet" }),
      ).toBeVisible();

      // Open the Add Application dialog via empty-state CTA
      await page.getByRole("button", { name: /add application/i }).first().click();

      // Dialog is visible
      await expect(
        page.getByRole("dialog", { name: /add application/i }),
      ).toBeVisible();

      // The company dropdown should be visible with no companies yet
      await expect(page.getByText("No companies yet")).toBeVisible();

      // Click "+ New" button to open the inline company form
      await page.getByRole("button", { name: /add new company/i }).click();

      // The inline form header is visible
      await expect(page.getByText("New company")).toBeVisible();

      // The dropdown is replaced by the inline form
      await expect(page.getByText("No companies yet")).not.toBeVisible();

      // Fill in the company name (required field)
      await page.getByLabel(/^name/i).fill("Inline Test Corp");

      // Also fill optional domain
      await page.getByLabel(/domain/i).fill("inlinetest.example.com");

      // Submit the inline company form
      await page.getByRole("button", { name: /create company/i }).click();

      // Success toast fires
      await expect(
        page.getByText(/Company "Inline Test Corp" created/i),
      ).toBeVisible({ timeout: 5_000 });

      // The inline panel closes — dropdown comes back
      await expect(page.getByText("New company")).not.toBeVisible();

      // The new company is auto-selected in the dropdown.
      // Check that the <select> has the new company as a selected option.
      const companySelect = page.locator("select[name='company_id']");
      await expect(companySelect).toBeVisible({ timeout: 3_000 });
      // The selected option text should be "Inline Test Corp"
      await expect(companySelect).toHaveValue(/\w+/); // non-empty value = a company is selected

      // Now fill in the role title and submit the application
      await page.getByLabel(/role title/i).fill("Staff Engineer");

      await page.getByRole("button", { name: /add application/i }).click();

      // Dialog closes + success toast
      await expect(
        page.getByText(/application added/i),
      ).toBeVisible({ timeout: 5_000 });

      // The application row appears in the list
      await expect(page.getByText("Staff Engineer")).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("cancel on inline company form returns to dropdown without submitting", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user);

      await page.getByRole("link", { name: /applications/i }).first().click();
      await page.waitForURL("**/applications");

      // Open dialog
      await page.getByRole("button", { name: /add application/i }).first().click();
      await expect(page.getByRole("dialog", { name: /add application/i })).toBeVisible();

      // Open inline form
      await page.getByRole("button", { name: /add new company/i }).click();
      await expect(page.getByText("New company")).toBeVisible();

      // Type something in the name field
      await page.getByLabel(/^name/i).fill("Cancel Corp");

      // Click Cancel — should close the inline panel
      // There are two Cancel buttons when CompanyForm is open (one in form, one in dialog footer).
      // Find the one inside the "New company" panel.
      const companyPanel = page.locator("text=New company").locator("..").locator("..");
      await companyPanel.getByRole("button", { name: /cancel/i }).click();

      // Panel closed, dropdown visible again
      await expect(page.getByText("New company")).not.toBeVisible();
      await expect(page.getByRole("button", { name: /add new company/i })).toBeVisible();

      // The application dialog is still open
      await expect(page.getByRole("dialog", { name: /add application/i })).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("existing companies spec still passes — add company via /companies page (regression)", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user);

      // Navigate to Companies
      await page.getByRole("link", { name: /companies/i }).first().click();
      await page.waitForURL("**/companies");

      // Empty state
      await expect(
        page.getByRole("heading", { name: "No companies here yet" }),
      ).toBeVisible();

      // Open AddCompanyDialog (still works after refactor)
      await page.getByRole("button", { name: /add a company/i }).click();

      await expect(
        page.getByRole("dialog", { name: /add company/i }),
      ).toBeVisible();

      // Fill all 4 fields (the full form via CompanyForm)
      await page.getByLabel(/^name/i).fill("Regression Corp");
      await page.getByLabel(/domain/i).fill("regression.example.com");
      await page.getByLabel(/industry/i).fill("SaaS");
      await page.getByLabel(/hq location/i).fill("Remote");

      await page.getByRole("button", { name: /^add company$/i }).click();

      await expect(
        page.getByText(/Regression Corp.*added|added.*Regression Corp/i),
      ).toBeVisible({ timeout: 5_000 });

      await expect(page.getByText("Regression Corp")).toBeVisible();
      await expect(page.getByText("regression.example.com")).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });
});
