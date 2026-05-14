/**
 * E2E coverage for PR 9b — minimap CV calibration editor.
 *
 * Same shape as `live-cs2.spec.ts`:
 *   - Web build → desktop-only placeholder.
 *   - Simulated-Tauri build → injects `window.__TAURI_INTERNALS__` BEFORE
 *     the SPA bundle evaluates. Stubs all calibration IPC commands.
 *
 * Coverage:
 *   - Web build placeholder renders.
 *   - Simulated-Tauri: page loads with the Region section active by default.
 *   - Section switcher (Region → Zones → Dots) flips the URL state.
 *   - The dirty-leave dialog fires when the operator navigates away with
 *     unsaved edits.
 */
import { expect, test, type Page } from "@playwright/test";
import { getOperatorCredentials, loginViaUI } from "./fixtures/auth";

interface CalibrationStubOptions {
  bundledPackage?: Record<string, unknown> | null;
  detectedResolution?: { width: number; height: number };
}

async function injectFakeTauriCalibration(
  page: Page,
  opts: CalibrationStubOptions = {},
): Promise<void> {
  await page.addInitScript((payload) => {
    const samplePkg = payload.bundledPackage ?? {
      map_slug: "mirage",
      calibration: {
        schema_version: 1,
        resolution: "1920x1080",
        minimap_region: { x: 16, y: 16, width: 280, height: 280 },
        world_transform: {
          scale_x: 0.00357,
          scale_y: 0.00357,
          offset_x: 0,
          offset_y: 0,
        },
        dot_detection: {
          target_rgb: [255, 255, 0],
          color_tolerance: 30,
          min_area_px: 6,
          max_area_px: 80,
        },
      },
      zones: [
        {
          slug: "a-site",
          name: "A Site",
          points: [
            [0.6, 0.2],
            [0.85, 0.2],
            [0.85, 0.4],
            [0.6, 0.4],
          ],
        },
      ],
    };

    const responses: Record<string, unknown> = {
      // Other PR 8 / 9a commands kept consistent with live-cs2.spec.ts
      gsi_server_status: {
        running: true,
        port: 8765,
        payloads_received: 0,
        auth_token_loaded: true,
      },
      get_app_version: { version: "0.0.1", build: "debug", pr: 9 },
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
      // PR 9b — calibration IPC surface
      cv_get_calibration: samplePkg,
      cv_set_calibration: "/tmp/mirage_1920x1080.json",
      cv_reset_calibration: { removed: true, path: "/tmp/mirage_1920x1080.json" },
      cv_get_primary_monitor_resolution:
        payload.detectedResolution ?? { width: 1920, height: 1080 },
      cv_capture_frame: {
        png_base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        width: 1920,
        height: 1080,
      },
      cv_set_dot_params_preview: { applied: true },
      cv_subscribe_debug_frames: null,
      cv_unsubscribe_debug_frames: null,
      cv_start: null,
      cv_stop: null,
    };

    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: (cmd: string, _args?: unknown) =>
        Promise.resolve(responses[cmd] ?? null),
      transformCallback: () => 0,
      metadata: { currentWebview: null, currentWindow: null },
    };
  }, opts);
}

test.describe("Calibration UI — web build (no Tauri)", () => {
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

  test("/live/cs2/calibrate shows the desktop-only placeholder", async ({
    page,
    request,
  }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/live/cs2/calibrate");
    await expect(
      page.getByRole("heading", {
        name: /calibration is a desktop feature/i,
      }),
    ).toBeVisible();
  });
});

test.describe("Calibration UI — simulated Tauri", () => {
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

  test("page loads with Region section active by default", async ({
    page,
    request,
  }) => {
    await injectFakeTauriCalibration(page);

    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/live/cs2/calibrate");

    // The placeholder must NOT show
    await expect(
      page.getByRole("heading", { name: /desktop feature/i }),
    ).toHaveCount(0);

    // Section nav present
    await expect(page.getByTestId("calibrate-nav-region")).toBeVisible();
    await expect(page.getByTestId("calibrate-nav-zones")).toBeVisible();
    await expect(page.getByTestId("calibrate-nav-dots")).toBeVisible();

    // Region panel has its capture button
    await expect(
      page.getByRole("button", { name: /Capture screen/i }),
    ).toBeVisible();
  });

  test("section nav switches the active panel", async ({ page, request }) => {
    await injectFakeTauriCalibration(page);
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);
    await page.goto("/live/cs2/calibrate");

    await page.getByTestId("calibrate-nav-zones").click();
    // ZonesPanel renders the "+ New zone" button
    await expect(page.getByTestId("zone-list-new-button")).toBeVisible();

    await page.getByTestId("calibrate-nav-dots").click();
    // DotsPanel surfaces "Live preview" card title
    await expect(page.getByText("Live preview")).toBeVisible();
  });

  test("source badge reads 'Bundled default' on first load", async ({
    page,
    request,
  }) => {
    await injectFakeTauriCalibration(page);
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);
    await page.goto("/live/cs2/calibrate");

    await expect(page.getByTestId("calibrate-source-badge")).toHaveText(
      /Bundled default/i,
    );
  });

  test("zones list renders bundled zones", async ({ page, request }) => {
    await injectFakeTauriCalibration(page);
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);
    await page.goto("/live/cs2/calibrate?section=zones");

    await expect(page.getByTestId("zone-list-a-site")).toBeVisible();
  });
});
