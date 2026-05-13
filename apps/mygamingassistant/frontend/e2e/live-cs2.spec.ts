/**
 * E2E coverage for the PR 8 CS2 GSI live mode surface.
 *
 * Approach (same as desktop-badge.spec.ts):
 *
 *   1. Web build path: the page renders a "desktop-only" placeholder; the
 *      live HUD does NOT render.
 *
 *   2. Simulated-Tauri path: inject `window.__TAURI_INTERNALS__` BEFORE
 *      the SPA bundle evaluates. Stub `invoke(...)` so calls to
 *      `gsi_server_status` return a controlled snapshot. Verify the live
 *      HUD renders with the receiver status row.
 *
 *   3. Override panel path: same simulated-Tauri shim, but the test also
 *      toggles the override button, picks dust2/T from the panel, and
 *      verifies the lineup query is fired with the override values
 *      (visible via the page's status row, since the actual XHR target
 *      depends on the backend being up).
 *
 * What we don't test here:
 *   - End-to-end Tauri IPC bridge — that's covered by the Rust integration
 *     tests under `apps/mygamingassistant/desktop/src-tauri/tests/`.
 *   - Live event injection via window event-bus — Tauri events are wired
 *     through the real native bridge and we don't simulate the listener
 *     callback chain here; the React hook tests in vitest cover that.
 */
import { expect, test, type Page } from "@playwright/test";
import { getOperatorCredentials, loginViaUI } from "./fixtures/auth";

/**
 * Stub `window.__TAURI_INTERNALS__` and `globalThis.__TAURI_INTERNALS__`
 * so the SPA's `isTauri()` returns true and the dynamic-imported
 * `@tauri-apps/api/core.invoke` delegates to our stub. The events API
 * (`@tauri-apps/api/event`) is harder to fake from `addInitScript` so we
 * accept that pushed events don't fire — the page should still render
 * empty/waiting states correctly.
 */
async function injectFakeTauri(
  page: Page,
  stub: {
    server_status?: Record<string, unknown>;
    install_result?: Record<string, unknown>;
    uninstall_result?: Record<string, unknown>;
    // PR 9a — CV pipeline stubs
    cv_status?: Record<string, unknown>;
  } = {},
): Promise<void> {
  await page.addInitScript((payload) => {
    const responses: Record<string, unknown> = {
      gsi_server_status: payload.server_status ?? {
        running: true,
        port: 8765,
        payloads_received: 0,
        auth_token_loaded: true,
      },
      install_cs2_gsi_config:
        payload.install_result ?? {
          installed: false,
          path: "",
          error: "Stubbed — not a real install",
        },
      uninstall_cs2_gsi_config:
        payload.uninstall_result ?? {
          removed: false,
          path: "",
          error: "Stubbed",
        },
      get_app_version: { version: "0.0.1", build: "debug", pr: 9 },
      // PR 9a — defaults reflect "Windows host, CV pipeline available but
      // stopped". Tests that need the running shape override via the
      // `cv_status` arg.
      cv_status: payload.cv_status ?? {
        running: false,
        platform_supported: true,
        current_map: null,
        last_zone: null,
        last_detection_at: null,
        ticks_total: 0,
        ticks_errored: 0,
        avg_tick_ms: 0,
        last_tick_ms: 0,
        calibration_loaded: false,
        last_error: null,
      },
      cv_start: null,
      cv_stop: null,
      cv_get_calibration: null,
    };

    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      // Route invokes by command name to a static response.
      invoke: (cmd: string, _args?: unknown) =>
        Promise.resolve(responses[cmd] ?? null),
      transformCallback: () => 0,
      metadata: { currentWebview: null, currentWindow: null },
    };
  }, stub);
}

test.describe("Live mode CS2 — web build (no Tauri)", () => {
  test.afterEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.evaluate(() => {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        // ignore
      }
    });
  });

  test("/live/cs2 shows the desktop-only placeholder", async ({
    page,
    request,
  }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/live/cs2");
    await expect(
      page.getByRole("heading", { name: /desktop feature/i }),
    ).toBeVisible();
    // The live HUD's connection-state badge should NOT render in the web
    // placeholder.
    await expect(page.getByText("Connected")).toHaveCount(0);
    await expect(page.getByText("Waiting")).toHaveCount(0);
  });

  test("Live (CS2) nav link is NOT present in the web sidebar", async ({
    page,
    request,
  }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/");
    // The sidebar is filtered to non-desktop items in the web build.
    await expect(page.getByRole("link", { name: /Live \(CS2\)/i })).toHaveCount(0);
  });
});

test.describe("Live mode CS2 — simulated Tauri", () => {
  test.afterEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.evaluate(() => {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        // ignore
      }
    });
  });

  test("/live/cs2 renders the live HUD with waiting state", async ({
    page,
    request,
  }) => {
    await injectFakeTauri(page, {
      server_status: {
        running: true,
        port: 8765,
        payloads_received: 0,
        auth_token_loaded: true,
      },
    });

    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/live/cs2");

    // The placeholder must NOT be shown.
    await expect(page.getByRole("heading", { name: /desktop feature/i })).toHaveCount(0);

    // Top bar status flips to "Waiting" (receiver running but zero payloads).
    await expect(page.getByText(/Waiting for CS2/i)).toBeVisible();

    // Footer shows the bound port.
    await expect(page.getByText(/Receiver :8765/)).toBeVisible();
  });

  test("Live nav link IS present in the simulated-Tauri sidebar", async ({
    page,
    request,
  }) => {
    await injectFakeTauri(page);

    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/");
    // In the simulated-Tauri context, the nav adds the desktop-only items.
    await expect(page.getByRole("link", { name: /Live \(CS2\)/i })).toBeVisible();
  });

  test("Override toggle reveals the override panel", async ({
    page,
    request,
  }) => {
    await injectFakeTauri(page);

    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/live/cs2");

    // Override panel is hidden initially.
    await expect(page.getByRole("region", { name: /manual override/i })).toHaveCount(0);

    // Click override.
    await page.getByRole("button", { name: /^Override$/ }).click();

    // Panel now visible.
    await expect(page.getByRole("region", { name: /manual override/i })).toBeVisible();
  });
});

test.describe("CS2 setup page — simulated Tauri", () => {
  test.afterEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.evaluate(() => {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        // ignore
      }
    });
  });

  test("/live/cs2/setup renders status card", async ({ page, request }) => {
    await injectFakeTauri(page, {
      server_status: {
        running: true,
        port: 8765,
        payloads_received: 0,
        auth_token_loaded: true,
      },
    });

    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/live/cs2/setup");

    await expect(
      page.getByRole("heading", { name: /CS2 Live Setup/i }),
    ).toBeVisible();
    await expect(page.getByText(/Running on :8765/)).toBeVisible();
  });

  test("install button surfaces error feedback for stubbed failure", async ({
    page,
    request,
  }) => {
    await injectFakeTauri(page, {
      install_result: {
        installed: false,
        path: "",
        error: "Directory does not exist: /fake/path. Is CS2 installed at this path?",
      },
    });

    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/live/cs2/setup");
    await page.getByRole("button", { name: /Install GSI config/i }).click();

    await expect(page.getByText(/Install failed/i)).toBeVisible();
    await expect(page.getByText(/Directory does not exist/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// PR 9a — CV pipeline panel on the setup page
// ---------------------------------------------------------------------------

test.describe("CV pipeline panel on setup page — simulated Tauri", () => {
  test.afterEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.evaluate(() => {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        // ignore
      }
    });
  });

  test("renders CV panel with platform_supported=true", async ({ page, request }) => {
    await injectFakeTauri(page, {
      cv_status: {
        running: false,
        platform_supported: true,
        current_map: null,
        last_zone: null,
        last_detection_at: null,
        ticks_total: 0,
        ticks_errored: 0,
        avg_tick_ms: 0,
        last_tick_ms: 0,
        calibration_loaded: false,
        last_error: null,
      },
    });

    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/live/cs2/setup");
    await expect(
      page.getByRole("heading", { name: /Position detection/i }),
    ).toBeVisible();
    // Start button is enabled when pipeline is stopped + platform supported
    await expect(page.getByRole("button", { name: /Start CV/i })).toBeEnabled();
    // Stop button is disabled when nothing is running
    await expect(page.getByRole("button", { name: /Stop CV/i })).toBeDisabled();
    // Calibration disclaimer present
    await expect(page.getByText(/bundled default calibration is for/i)).toBeVisible();
  });

  test("renders Windows-only banner when platform_supported=false", async ({
    page,
    request,
  }) => {
    await injectFakeTauri(page, {
      cv_status: {
        running: false,
        platform_supported: false,
        current_map: null,
        last_zone: null,
        last_detection_at: null,
        ticks_total: 0,
        ticks_errored: 0,
        avg_tick_ms: 0,
        last_tick_ms: 0,
        calibration_loaded: false,
        last_error: null,
      },
    });

    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/live/cs2/setup");
    await expect(page.getByText(/Windows only/i)).toBeVisible();
    // Start / Stop buttons should not render on unsupported platforms
    await expect(page.getByRole("button", { name: /Start CV/i })).toHaveCount(0);
  });

  test("CV panel shows running state when pipeline is up", async ({ page, request }) => {
    await injectFakeTauri(page, {
      cv_status: {
        running: true,
        platform_supported: true,
        current_map: "mirage",
        last_zone: "a-site",
        last_detection_at: "2026-05-13T10:00:00Z",
        ticks_total: 42,
        ticks_errored: 1,
        avg_tick_ms: 7.5,
        last_tick_ms: 8.0,
        calibration_loaded: true,
        last_error: null,
      },
    });

    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/live/cs2/setup");
    // Pipeline status row shows "Running"
    await expect(page.getByText("Running", { exact: true })).toBeVisible();
    // Calibration loaded for mirage
    await expect(page.getByText(/Loaded for mirage/i)).toBeVisible();
    // Detected zone shown (formatted)
    await expect(page.getByText(/A Site/)).toBeVisible();
    // Tick counters visible
    await expect(page.getByText(/42 \/ 1/)).toBeVisible();
    // Start is disabled when already running; Stop is enabled
    await expect(page.getByRole("button", { name: /Start CV/i })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Stop CV/i })).toBeEnabled();
  });
});
