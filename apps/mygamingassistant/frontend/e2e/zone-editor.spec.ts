/**
 * E2E for the plan-mode zone editor.
 *
 * Coverage:
 *  1. /{game}/{map}/zones/edit requires auth — unauth caller sees the
 *     AuthRequired sign-in CTA.
 *  2. Operator landing on a not-yet-calibrated MapPage sees the "zones
 *     not drawn yet" banner with Set up zones CTA.
 *  3. Editor page renders top bar + zone list when authed.
 *  4. Clicking an empty zone in the rail enters drawing mode (mode hint
 *     above canvas reflects the change; floating action bar shows Cancel).
 *  5. Save button is disabled when nothing is dirty.
 *
 * The full draw-save-roundtrip-render flow needs canvas mouse simulation
 * which is brittle in headless Playwright; the underlying canvas
 * mechanics are covered by the unit tests for ZoneEditorCanvas (already
 * shipped) and useZoneEditorDraft (this PR). This spec focuses on the
 * orchestration glue.
 */
import { test, expect } from "@playwright/test";
import { getOperatorCredentials, loginViaUI } from "./fixtures/auth";

test.describe("Zone editor — auth gate", () => {
  test("unauth visit shows sign-in CTA", async ({ page }) => {
    await page.goto("/cs2/mirage/zones/edit");
    await expect(page.getByText(/edit map zones/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });
});

test.describe("MapPage — operator banner when zones not drawn", () => {
  test("operator sees the not-yet-drawn banner + CTA", async ({ page, request }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/cs2/mirage");
    // Banner copy from MapPage.tsx
    await expect(
      page.getByText(/this map's zones aren't drawn yet/i),
    ).toBeVisible();
    const cta = page.getByRole("link", { name: /set up zones/i });
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/cs2\/mirage\/zones\/edit$/);
  });

  test("operator sees Edit zones header button", async ({ page, request }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/cs2/mirage");
    await expect(page.getByRole("link", { name: /edit zones/i })).toBeVisible();
  });
});

test.describe("Zone editor page", () => {
  test("authed editor shows top bar + zone list + Save disabled at start", async ({
    page,
    request,
  }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/cs2/mirage/zones/edit");

    // Top bar — page title
    await expect(page.getByRole("heading", { name: /edit zones — mirage/i })).toBeVisible();

    // Save button disabled when nothing is dirty
    const saveButton = page.getByRole("button", { name: /^save$/i });
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeDisabled();

    // Zone list rendered (Mirage seed has 10 zones).
    await expect(page.getByText(/zones \(10\)/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /a site/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /b site/i })).toBeVisible();
  });

  test("clicking an empty zone enters drawing mode", async ({ page, request }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/cs2/mirage/zones/edit");

    // Click "A Site" (which has empty polygon_points after fresh seed) — should
    // auto-enter `new` drawing mode per the design spec.
    await page.getByRole("button", { name: /a site/i }).click();

    // The action bar swaps to Cancel + the mode hint above the canvas
    // mentions "Click to add vertices".
    await expect(page.getByText(/click to add vertices/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
  });

  test("Discard button disabled when no dirty changes", async ({ page, request }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/cs2/mirage/zones/edit");
    const discardButton = page.getByRole("button", { name: /discard/i });
    await expect(discardButton).toBeVisible();
    await expect(discardButton).toBeDisabled();
  });
});
