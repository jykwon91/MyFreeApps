/**
 * E2E coverage for the PR 7 Tauri smoke surface.
 *
 * The DesktopBadge component renders only when `window.__TAURI_INTERNALS__`
 * is present — Tauri injects this at startup. In a regular browser (which
 * is what Playwright drives), the injection never happens and the badge
 * MUST NOT render.
 *
 * This spec is the negative-coverage E2E for the web build:
 *   - Settings page loads
 *   - "Desktop build" card is NOT present
 *
 * The positive-coverage E2E (badge visible under Tauri + IPC succeeds) is
 * deferred until the project picks up `tauri-driver` / WebDriver tooling.
 * Until then, the unit tests in DesktopBadge.test.tsx cover the Tauri-
 * present branch via a mocked `@tauri-apps/api/core`.
 */
import { test, expect } from "@playwright/test";
import { getOperatorCredentials, loginViaUI } from "./fixtures/auth";

test.describe("DesktopBadge — web build (PR 7)", () => {
  test("Settings page does NOT show the Desktop build card", async ({
    page,
    request,
  }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Settings" }),
    ).toBeVisible();

    // Sanity: the two regular Settings cards ARE present in every build.
    await expect(page.getByText(/Two-factor authentication/i)).toBeVisible();
    await expect(
      page.getByText(/Account management options coming in a future phase/i),
    ).toBeVisible();

    // The Desktop build card should NOT be present in the web build.
    // Card titles render via @platform/ui's Card component as a heading
    // matching the title prop. Use a strict text match to avoid false
    // positives if other UI mentions "desktop" tangentially.
    await expect(page.getByText("Desktop build", { exact: true })).toHaveCount(0);
  });

  test("window.__TAURI_INTERNALS__ is undefined in the web build", async ({
    page,
    request,
  }) => {
    // Defensive: if a future change accidentally polyfills the Tauri
    // injection (e.g., a mock that leaks into the production bundle),
    // this assertion catches it before the badge appears for real users.
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/settings");

    const tauriPresent = await page.evaluate(
      () => "__TAURI_INTERNALS__" in window,
    );
    expect(tauriPresent).toBe(false);
  });
});
