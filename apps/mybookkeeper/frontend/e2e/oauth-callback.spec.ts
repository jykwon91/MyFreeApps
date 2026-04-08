import { test, expect } from "@playwright/test";

test.describe("OAuth callback — error handling", () => {
  test("callback without params does not crash the app", async ({ page }) => {
    const response = await page.goto("/oauth-callback");
    // Page should load without 5xx error
    expect(response?.status()).toBeLessThan(500);
    // Should eventually land somewhere stable (login, error, or dashboard)
    await page.waitForLoadState("domcontentloaded");
    const url = page.url();
    expect(url).toBeTruthy();
  });

  test("callback with invalid code does not crash the app", async ({ page }) => {
    const response = await page.goto("/oauth-callback?code=fake&state=invalid");
    expect(response?.status()).toBeLessThan(500);
    await page.waitForLoadState("domcontentloaded");
    // Should not show a blank page — some content should render
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(0);
  });
});
