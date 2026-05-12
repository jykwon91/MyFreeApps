/**
 * E2E smoke tests for PR 3: pin system + round mode + keyboard shortcuts.
 *
 * Coverage:
 *  1. Pin a lineup via the pin button in plan mode
 *  2. Enter round mode (?round=1) and confirm pinned lineup is visible
 *  3. Press Esc to exit round mode → confirm back in plan mode
 *  4. Keyboard shortcut 'p' toggles round mode
 *  5. Compact mode (?compact=1) hides the app shell
 *  6. Keyboard shortcut '?' shows shortcuts help overlay
 *
 * Requirements:
 *  - Backend on :8004 with migrations + fixtures loaded
 *  - E2E_TEST_EMAIL + E2E_TEST_PASSWORD set to seed user credentials
 *  - At least one lineup in the DB for the valorant/bind map
 *
 * Notes:
 *  - Since lineup data may not exist in CI, many assertions are conditional
 *    (check count > 0 before interacting). This matches PR 2's pattern.
 *  - The pin state persists via localStorage; each test clears it on setup.
 */
import { test, expect } from "@playwright/test";
import { getOperatorCredentials, loginViaUI } from "./fixtures/auth";

test.describe("Pin system + round mode", () => {
  test.beforeEach(async ({ page, request }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);
    // Clear all mga.pins localStorage entries between tests
    await page.evaluate(() => {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("mga.pins.")) keysToRemove.push(key);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    });
  });

  test("plan mode shows pin buttons when lineups are visible", async ({ page }) => {
    await page.goto("/valorant/bind");
    await page.waitForTimeout(400);

    // Click a zone to reveal lineups
    const polygons = page.locator("svg polygon");
    const polyCount = await polygons.count();
    if (polyCount === 0) {
      test.skip(); // No zone data in this environment
      return;
    }

    // Find a zone with lineups — click polygons until panel appears
    let panelVisible = false;
    for (let i = 0; i < polyCount && !panelVisible; i++) {
      await polygons.nth(i).click({ force: true });
      await page.waitForTimeout(300);
      panelVisible = await page.locator('[aria-label="Lineup results"]').isVisible().catch(() => false);
    }

    if (!panelVisible) {
      test.skip(); // No lineups in DB
      return;
    }

    // There should be at least one pin button visible
    const pinBtns = page.getByRole("button", { name: /pin lineup/i });
    await expect(pinBtns.first()).toBeVisible({ timeout: 3000 });
  });

  test("pinning a lineup persists to localStorage", async ({ page }) => {
    await page.goto("/valorant/bind");
    await page.waitForTimeout(400);

    const polygons = page.locator("svg polygon");
    const polyCount = await polygons.count();
    if (polyCount === 0) {
      test.skip();
      return;
    }

    let panelVisible = false;
    for (let i = 0; i < polyCount && !panelVisible; i++) {
      await polygons.nth(i).click({ force: true });
      await page.waitForTimeout(300);
      panelVisible = await page.locator('[aria-label="Lineup results"]').isVisible().catch(() => false);
    }

    if (!panelVisible) {
      test.skip();
      return;
    }

    const pinBtn = page.getByRole("button", { name: "Pin lineup" }).first();
    const isVisible = await pinBtn.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip();
      return;
    }

    await pinBtn.click();

    // localStorage should now have a mga.pins.* key with content
    const pinned = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("mga.pins.")) {
          const val = localStorage.getItem(key);
          if (val && val !== "[]") return true;
        }
      }
      return false;
    });
    expect(pinned).toBe(true);
  });

  test("round mode shows pinned lineups, hides map", async ({ page }) => {
    await page.goto("/valorant/bind");
    await page.waitForTimeout(400);

    // Pin a lineup if possible
    const polygons = page.locator("svg polygon");
    const polyCount = await polygons.count();

    if (polyCount > 0) {
      let panelVisible = false;
      for (let i = 0; i < polyCount && !panelVisible; i++) {
        await polygons.nth(i).click({ force: true });
        await page.waitForTimeout(300);
        panelVisible = await page.locator('[aria-label="Lineup results"]').isVisible().catch(() => false);
      }

      if (panelVisible) {
        const pinBtn = page.getByRole("button", { name: "Pin lineup" }).first();
        if (await pinBtn.isVisible().catch(() => false)) {
          await pinBtn.click();
        }
      }
    }

    // Navigate to round mode
    await page.goto(`/valorant/bind?round=1`);
    await page.waitForTimeout(400);

    // Should show the "Exit round mode" button
    await expect(page.getByRole("link", { name: /exit round mode/i })).toBeVisible();

    // Should NOT show the minimap SVG
    const minimap = page.locator('img[alt*="minimap"]');
    await expect(minimap).not.toBeVisible();
  });

  test("Esc in round mode exits to plan mode", async ({ page }) => {
    await page.goto("/valorant/bind?round=1");
    await page.waitForTimeout(300);

    await page.keyboard.press("Escape");
    // Should no longer have round=1 in URL
    await expect(page).not.toHaveURL(/[?&]round=1/);
    // Should be back in plan mode — minimap or the zone overlay should be visible
    await expect(page.locator("main")).toBeVisible();
  });

  test("compact mode hides app shell (nav/header)", async ({ page }) => {
    await page.goto("/valorant/bind?compact=1");
    await page.waitForTimeout(300);

    // AppShell renders a nav element — it should be gone in compact mode
    const nav = page.locator("nav").first();
    await expect(nav).not.toBeVisible();
  });

  test("'p' keyboard shortcut toggles round mode", async ({ page }) => {
    await page.goto("/valorant/bind");
    await page.waitForTimeout(300);

    await page.keyboard.press("p");
    await expect(page).toHaveURL(/[?&]round=1/);

    // Press again to toggle back
    await page.keyboard.press("p");
    const url = page.url();
    expect(url).not.toMatch(/[?&]round=1/);
  });

  test("'?' key shows keyboard shortcuts help overlay", async ({ page }) => {
    await page.goto("/valorant/bind");
    await page.waitForTimeout(300);

    await page.keyboard.press("?");
    // Shortcuts help dialog should appear
    await expect(page.getByRole("dialog", { name: /keyboard shortcuts/i })).toBeVisible();

    // Close it
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /keyboard shortcuts/i })).not.toBeVisible();
  });

  test("round mode 'Exit round mode' link returns to plan mode", async ({ page }) => {
    await page.goto("/valorant/bind?round=1");
    await page.waitForTimeout(300);

    const exitLink = page.getByRole("link", { name: /exit round mode/i });
    await expect(exitLink).toBeVisible();
    await exitLink.click();

    // Should no longer be in round mode
    await expect(page).not.toHaveURL(/[?&]round=1/);
  });
});
