/**
 * E2E tests for the Company Research panel.
 *
 * These tests verify the UI-visible states of the research panel on the
 * Company detail page:
 *  1. Panel renders "Run research" button before research is run (no-research state).
 *  2. Error toast shown when research fails (Tavily not configured in test env).
 *
 * NOTE: We do not test the "ready" state end-to-end because it requires a real
 * Tavily API key + Claude API key, which are not available in the CI test environment.
 * The ready-state rendering is covered by unit tests (CompanyResearchPanel.test.tsx).
 */
import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginViaUI } from "./fixtures/auth";

test.describe("Company Research panel", () => {
  test("shows 'Run research' button on company detail before research is run", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);

      // Navigate to Companies and create a company
      await page.getByRole("link", { name: /companies/i }).first().click();
      await page.waitForURL("**/companies");
      await page.getByRole("button", { name: /add a company/i }).click();
      await page.locator("#ac-name").fill("Research Test Corp");
      await page.locator("#ac-domain").fill("researchtestcorp.example.com");
      await page.getByRole("button", { name: /^add company$/i }).click();

      // Navigate to the company detail page
      const row = page.getByRole("button").filter({ hasText: "Research Test Corp" }).first();
      await expect(row).toBeVisible({ timeout: 5_000 });
      await row.click();
      await page.waitForURL("**/companies/**");

      // AI Research section is visible
      await expect(page.getByRole("heading", { name: /ai research/i })).toBeVisible();

      // Run research button is present (no-research state)
      await expect(page.getByRole("button", { name: /run research/i })).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("research panel shows error feedback when Tavily is not configured", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);

      // Navigate to Companies and create a company
      await page.getByRole("link", { name: /companies/i }).first().click();
      await page.waitForURL("**/companies");
      await page.getByRole("button", { name: /add a company/i }).click();
      await page.locator("#ac-name").fill("Research Error Corp");
      await page.getByRole("button", { name: /^add company$/i }).click();

      const row = page.getByRole("button").filter({ hasText: "Research Error Corp" }).first();
      await expect(row).toBeVisible({ timeout: 5_000 });
      await row.click();
      await page.waitForURL("**/companies/**");

      // Click "Run research" — expect either a toast error or the panel transitions
      // to failed state (both are valid outcomes when Tavily is unconfigured in test env)
      await page.getByRole("button", { name: /run research/i }).click();

      // Wait for a visible error signal: either toast or failed-state retry button
      await expect(
        page.getByRole("button", { name: /retry/i })
          .or(page.getByRole("region", { name: /notifications/i }).getByText(/research|error|failed/i))
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await deleteTestUser(request, user);
    }
  });
});
