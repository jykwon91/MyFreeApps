/**
 * E2E: Company creation flows related to the Add Application dialog.
 *
 * The inline-company-from-dialog flow (dropdown + "+ New" panel) was removed
 * when AddApplicationDialog was redesigned in PR #371 to a URL/text/manual
 * state machine. Those tests have been deleted; the regression test for the
 * standalone /companies page is retained.
 */
import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginViaUI } from "./fixtures/auth";

test.describe("Applications — inline company create", () => {
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
        page.getByText(/Regression Corp.*added|added.*Regression Corp/i).first(),
      ).toBeVisible({ timeout: 5_000 });

      await expect(page.getByRole("button", { name: /Regression Corp/i }).first()).toBeVisible();
      await expect(page.getByText("regression.example.com").first()).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });
});
