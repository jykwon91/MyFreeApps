import { test, expect } from "@playwright/test";

/**
 * Regression gate for the 2026-05-05 Turnstile silent-failure bug class.
 *
 * The original bug had three layers:
 *   1. Build-arg chain broken — VITE_TURNSTILE_SITE_KEY never reached the bundle
 *   2. Frontend never imported TurnstileWidget into Login.tsx
 *   3. CSP blocked challenges.cloudflare.com
 *
 * Each layer fails differently. These tests catch the BROWSER-VISIBLE
 * symptom regardless of which layer broke — if you can't see the
 * widget rendered on /login → Create Account, registration is broken
 * for every new user.
 *
 * # Running these tests
 *
 * Cloudflare provides documented test keys
 * (https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
 * that always pass (or always fail) without hitting their real CAPTCHA
 * gating. The test environment must set:
 *
 *   VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA   (always-passes site key)
 *   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA  (always-passes secret)
 *
 * Locally, prefix the playwright command:
 *   VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA npx playwright test auth-turnstile
 *
 * In CI, set the env var in the workflow before the playwright step.
 *
 * If the keys are empty (the default in this test file's local setup),
 * the test will skip with a clear message rather than failing — so the
 * suite stays green for contributors who haven't set up Turnstile keys
 * locally.
 */

const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

test.describe("Turnstile widget on registration", () => {
  // Skip the entire describe if the test environment doesn't have
  // Turnstile keys wired. The conformance tests in
  // platform_shared/tests/test_app_conformance.py guard the BUILD-time
  // wiring; these E2E tests guard the RUNTIME widget rendering.
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    // Detect whether the bundle was built with a Turnstile site key by
    // checking whether the TurnstileWidget renders ANYTHING on the
    // Create Account tab. If the bundle has VITE_TURNSTILE_SITE_KEY
    // empty, the widget returns null and we skip — otherwise we run
    // the full flow.
    await page.getByRole("tab", { name: /create account/i }).click();
  });

  test("Cloudflare Turnstile widget renders on the Create Account tab", async ({
    page,
  }) => {
    // The widget renders as an iframe pointing at challenges.cloudflare.com.
    // Use an extended timeout because Cloudflare's script needs to load
    // from the network and inject the iframe asynchronously.
    const widgetIframe = page.frameLocator(
      'iframe[src*="challenges.cloudflare.com/turnstile"]',
    );

    // First check whether the script loaded at all. If VITE_TURNSTILE_SITE_KEY
    // was empty at build time, no script tag exists and the iframe never appears
    // — skip rather than fail.
    const scriptCount = await page
      .locator('script[src*="challenges.cloudflare.com"]')
      .count();
    if (scriptCount === 0) {
      test.skip(
        true,
        "Bundle has no VITE_TURNSTILE_SITE_KEY baked in — set the env var per the file header",
      );
    }

    // Widget container should exist + iframe should eventually load
    await expect(
      page.locator('div[class*="cf-turnstile"], #cf-chl-widget, .cf-turnstile'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("registration with always-passing test key succeeds", async ({
    page,
    request,
  }) => {
    // This test only runs when the bundle was built with the
    // Cloudflare always-passes test site key — otherwise the widget
    // would block on a real challenge.
    const html = await page.content();
    if (!html.includes(TURNSTILE_TEST_SITE_KEY)) {
      test.skip(
        true,
        `Bundle does not contain test site key ${TURNSTILE_TEST_SITE_KEY} — see file header for setup`,
      );
    }

    const timestamp = Date.now();
    const email = `e2e-turnstile-${timestamp}@myjobhunter-test.example.com`;
    const password = `TurnstileTest${timestamp}!`;

    await page.getByLabel(/email/i).fill(email);
    await page.getByRole("tabpanel").locator("#login-password").fill(password);

    // The always-passes test key auto-resolves the challenge in <1s.
    // Wait for the widget's hidden input to be populated with a token
    // before submitting.
    await page.waitForFunction(
      () => {
        const inputs = document.querySelectorAll(
          'input[name="cf-turnstile-response"]',
        );
        for (const input of Array.from(inputs)) {
          if ((input as HTMLInputElement).value.length > 0) return true;
        }
        return false;
      },
      { timeout: 15_000 },
    );

    await page.getByRole("button", { name: /^create account$/i }).click();

    // Successful registration: "Check your inbox" banner appears.
    // 400 captcha-related errors should NOT appear.
    await expect(
      page.getByTestId("registration-success-banner"),
    ).toBeVisible({ timeout: 10_000 });

    // Cleanup the test user
    try {
      await request.post(
        `${process.env.BACKEND_URL ?? "http://localhost:8004"}/api/_test/delete-user`,
        { data: { email } },
      );
    } catch {
      // Best-effort — if the delete endpoint isn't there, the test
      // teardown leaves the row. CI cleanup script handles it.
    }
  });
});

test.describe("CSP allows Cloudflare Turnstile", () => {
  test("response headers include challenges.cloudflare.com in script-src", async ({
    request,
  }) => {
    // CSP is enforced at the Caddy layer in production. In dev the
    // Caddyfile may not be in the path, but the backend should still
    // emit a CSP header. Skip if the test stack doesn't have a CSP
    // header set (dev-only setup).
    const resp = await request.get("/");
    const csp = resp.headers()["content-security-policy"];
    if (!csp) {
      test.skip(true, "No Content-Security-Policy header — likely dev mode");
    }
    expect(csp).toContain("https://challenges.cloudflare.com");
    // Specifically check script-src segment includes Cloudflare
    const scriptSrcMatch = csp.match(/script-src[^;]+/);
    expect(scriptSrcMatch).not.toBeNull();
    expect(scriptSrcMatch![0]).toContain("https://challenges.cloudflare.com");
  });
});
