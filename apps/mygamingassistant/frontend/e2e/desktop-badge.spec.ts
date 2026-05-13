/**
 * E2E coverage for the PR 7 Tauri smoke surface — DesktopBadge.
 *
 * The DesktopBadge component renders only when `window.__TAURI_INTERNALS__`
 * is present — Tauri injects this at startup. Playwright drives Chromium,
 * so we exercise BOTH branches:
 *
 *   1. Web build (no shim) — badge is absent, `__TAURI_INTERNALS__` undefined.
 *   2. Simulated-Tauri build (shim via `page.addInitScript`) — badge renders
 *      with the version + build profile from a mocked `get_app_version`.
 *
 * The simulated-Tauri test is the closest we can get to true positive
 * coverage without `tauri-driver` / WebDriver wiring. It exercises the
 * full DOM render path of the gated component — the only thing it can't
 * verify is the real Rust IPC bridge (covered by the cross-platform CI
 * build job in `.github/workflows/ci-mygamingassistant-desktop.yml`).
 */
import { test, expect, type Page } from "@playwright/test";
import { getOperatorCredentials, loginViaUI } from "./fixtures/auth";

/**
 * Inject a fake Tauri runtime BEFORE the SPA bundle evaluates.
 *
 * `addInitScript` runs in every new document, so the injection lands before
 * the React app mounts. We:
 *   1. Set `window.__TAURI_INTERNALS__` so `isTauri()` returns true.
 *   2. Mock the dynamic-imported `@tauri-apps/api/core.invoke` by stubbing
 *      it on the global before the import resolves. The lib/tauri.ts wrapper
 *      uses `await import("@tauri-apps/api/core")`; we intercept by patching
 *      `window.__tauri_invoke__` and short-circuiting the import via a
 *      service-worker-style override would be heavy. Simpler: monkey-patch
 *      `Function.prototype` for the imported module is also messy. The
 *      cleanest hook is replacing `globalThis.__TAURI_INTERNALS__.invoke`
 *      because the real `@tauri-apps/api/core.invoke` delegates to it.
 */
async function injectFakeTauri(page: Page, mockResponse: object): Promise<void> {
  await page.addInitScript((payload) => {
    // The real Tauri runtime exposes `__TAURI_INTERNALS__.invoke(cmd, args)`
    // and `@tauri-apps/api/core.invoke` delegates to it. Implementing the
    // same surface is enough to make our component think it's running under
    // Tauri.
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      // tauri-apps/api/core's invoke signature: (cmd, args) => Promise<unknown>
      invoke: (_cmd: string, _args?: unknown) => Promise.resolve(payload),
      // Tauri 2.x also reads these — provide stubs so the import succeeds.
      transformCallback: () => 0,
      metadata: { currentWebview: null, currentWindow: null },
    };
  }, mockResponse);
}

test.describe("DesktopBadge — web build (PR 7)", () => {
  test.afterEach(async ({ page }) => {
    // Clear browser session state so the next test starts clean. MGA is
    // single-user (no test users to delete server-side), so this is purely
    // browser-side cleanup.
    await page.context().clearCookies();
    await page.evaluate(() => {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        // Some pages (e.g., about:blank) deny storage access; safe to ignore.
      }
    });
  });

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

test.describe("DesktopBadge — simulated Tauri (PR 7)", () => {
  test.afterEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.evaluate(() => {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        // ignore — about:blank denies storage
      }
    });
  });

  test("Settings page renders the Desktop build card with mocked version", async ({
    page,
    request,
  }) => {
    // Inject the fake Tauri runtime BEFORE any page navigation, so the
    // SPA bundle's first eval sees `__TAURI_INTERNALS__`.
    await injectFakeTauri(page, { version: "0.0.1", build: "debug", pr: 7 });

    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Settings" }),
    ).toBeVisible();

    // The Desktop build card SHOULD now be present.
    await expect(
      page.getByText("Desktop build", { exact: true }),
    ).toBeVisible();

    // And it should display the mocked version + build + PR fields.
    await expect(page.getByText(/v0\.0\.1/)).toBeVisible();
    await expect(page.getByText(/debug/)).toBeVisible();
    await expect(page.getByText(/PR 7/)).toBeVisible();
  });
});
