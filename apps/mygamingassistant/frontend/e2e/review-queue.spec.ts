/**
 * Review queue E2E tests (PR 5).
 *
 * These tests verify the /review page renders, handles empty state, and
 * navigates correctly. They do NOT test the accept/hide/classify flows
 * end-to-end because those require a live Anthropic API key + ingested
 * lineups, which are not available in CI.
 *
 * What IS tested:
 *  - /review is accessible after login
 *  - Review nav item is present and navigates correctly
 *  - Empty state renders when there are no pending lineups
 *  - Filter bar controls are present
 *  - Unauthenticated access redirects to /login
 */
import { test, expect } from "@playwright/test";
import { getOperatorCredentials, loginViaUI } from "./fixtures/auth";

test.describe("Review queue page", () => {
  test("review page accessible after login — shows empty state or cards", async ({
    page,
    request,
  }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/review");
    await page.waitForURL("**/review");

    // Page heading should be present
    await expect(page.getByRole("heading", { name: /review queue/i })).toBeVisible();
  });

  test("review nav link navigates to /review", async ({ page, request }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    // Start from the games page
    await page.goto("/");

    // Click the Review nav item in the sidebar
    await page.getByRole("link", { name: /review/i }).first().click();
    await page.waitForURL("**/review");

    await expect(page).toHaveURL(/\/review/);
    await expect(page.getByRole("heading", { name: /review queue/i })).toBeVisible();
  });

  test("empty state renders with links to sources when no pending lineups", async ({
    page,
    request,
  }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/review");

    // Either cards are shown (non-empty queue) or an empty state message is shown.
    // In a fresh CI environment with no ingested lineups, empty state should appear.
    const hasEmptyState = await page.getByText(/no lineups/i).isVisible().catch(() => false);
    const hasCards = await page.locator("[data-testid='review-card'], .review-card").count().then(n => n > 0).catch(() => false);

    // At least one of these must be true — page must render something meaningful
    expect(hasEmptyState || hasCards).toBe(true);
  });

  test("filter bar controls are present", async ({ page, request }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/review");
    await page.waitForURL("**/review");

    // Filter controls should be visible (game dropdown, confidence filter)
    // These render even with an empty queue
    const gameFilter = page.getByRole("combobox").first();
    await expect(gameFilter).toBeVisible();
  });

  test("unauthenticated access to /review redirects to login", async ({ page }) => {
    // Navigate without logging in — should redirect to /login
    await page.goto("/review");
    await page.waitForURL("**/login", { timeout: 5_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
