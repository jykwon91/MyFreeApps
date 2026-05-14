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

  test("unauthenticated visitor sees AuthRequired fallback on /settings", async ({ page }) => {
    // MGA uses public-read / auth-write — gated routes show a Sign-in
    // fallback in place rather than redirecting. The user clicks the
    // Sign-in CTA to navigate to /login. See CLAUDE.md → Authentication Model.
    await page.goto("/settings");
    // No redirect — the URL stays on /settings
    await expect(page).toHaveURL(/\/settings/);
    // The AuthRequired card surfaces a heading and a Sign in button
    await expect(
      page.getByRole("heading", { name: /sign in to manage your account/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^sign in$/i })
    ).toBeVisible();
  });

  test("unauthenticated visitor can browse the games page", async ({ page }) => {
    // Public-read: the games list is reachable without auth.
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Games" })).toBeVisible();
    // The top-bar Sign in CTA is present so the operator can authenticate
    // when they need to manage content.
    await expect(page.getByTestId("topbar-sign-in")).toBeVisible();
  });

  test("unauthenticated visitor reaches the gated page after sign-in", async ({ page, request }) => {
    // The Sign-in CTA from AuthRequired should round-trip back to the
    // originally-requested gated page after a successful login.
    await page.goto("/sources");
    // AuthRequired fallback is visible
    await expect(
      page.getByRole("heading", { name: /sign in to manage video sources/i })
    ).toBeVisible();
    // Click the Sign in button → /login
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL("**/login", { timeout: 5_000 });

    // Authenticate and confirm we land back on /sources
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request, { startAtLogin: true });
    await page.waitForURL("**/sources", { timeout: 5_000 });
    await expect(page).toHaveURL(/\/sources/);
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
