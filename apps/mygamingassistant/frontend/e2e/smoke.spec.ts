/**
 * Smoke test suite — covers the primary user journey for MGA Phase 1.
 *
 * MGA is single-user; there is no /register route. The test logs in as
 * the seeded operator user (credentials from E2E_TEST_EMAIL / E2E_TEST_PASSWORD
 * env vars — see e2e/fixtures/auth.ts for setup instructions).
 *
 * These tests require:
 *  1. Backend running on :8004 with migrations applied (alembic upgrade head)
 *  2. Fixtures loaded (python -m app.cli load-fixtures)
 *  3. E2E_TEST_EMAIL and E2E_TEST_PASSWORD set to the seeded user's credentials
 *
 * In CI, the workflow sets up a test database and seeds the operator user
 * before running this suite.
 */
import { test, expect } from "@playwright/test";
import { getOperatorCredentials, loginViaUI } from "./fixtures/auth";

test.describe("MyGamingAssistant smoke tests", () => {
  test("login + navigate primary pages + sign out", async ({ page, request }) => {
    const credentials = getOperatorCredentials();

    // 1. Log in via the UI
    await loginViaUI(page, credentials, request);

    // After login we land on the games page (/)
    await expect(page).toHaveURL(/\/$/);

    // 2. Games page — heading is present
    await expect(
      page.getByRole("heading", { name: "Games" })
    ).toBeVisible();

    // 3. Settings page
    await page.getByRole("link", { name: /settings/i }).first().click();
    await page.waitForURL("**/settings");
    await expect(
      page.getByRole("heading", { name: "Settings" })
    ).toBeVisible();

    // 4. Security page (via link in settings)
    await page.getByRole("link", { name: /two-factor authentication/i }).first().click();
    await page.waitForURL("**/security");
    await expect(
      page.getByRole("heading", { name: "Security" })
    ).toBeVisible();
    await expect(
      page.getByText(/Two-Factor Authentication/i)
    ).toBeVisible();

    // 5. 404 page
    await page.goto("/nonexistent-page-xyz");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /back to games/i })
    ).toBeVisible();

    // 6. Navigate back to games via 404 back link
    await page.getByRole("link", { name: /back to games/i }).click();
    await page.waitForURL("**/");
    await expect(page).toHaveURL(/\/$/);

    // 7. Sign out via the user menu in the AppShell sidebar
    const signOutButton = page.getByRole("menuitem", { name: /sign out/i });
    await page.locator("aside").getByRole("button").last().click();
    await expect(signOutButton).toBeVisible();
    await signOutButton.click();

    await page.waitForURL("**/login", { timeout: 5_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirect to login when unauthenticated", async ({ page }) => {
    // Navigating to any protected route without a token should redirect to /login
    await page.goto("/settings");
    await page.waitForURL("**/login", { timeout: 5_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("games page shows Valorant and CS2 after fixtures loaded", async ({ page, request }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Games" })).toBeVisible();

    // Fixtures should have loaded Valorant and CS2
    await expect(page.getByText("Valorant")).toBeVisible();
    await expect(page.getByText("CS2")).toBeVisible();
  });

  test("navigate to Valorant map grid", async ({ page, request }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    // Click on Valorant game card
    await page.goto("/");
    await page.getByText("Valorant").click();
    await page.waitForURL("**/valorant");

    // Should show map grid heading
    await expect(
      page.getByRole("heading", { name: "Valorant" })
    ).toBeVisible();

    // Bind is one of the 9 Valorant maps in fixtures
    await expect(page.getByText("bind")).toBeVisible();
  });
});
