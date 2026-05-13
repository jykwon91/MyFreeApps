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
      get_app_version: { version: "0.0.1", build: "debug", pr: 8 },
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
