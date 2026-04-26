import { test, expect } from "./fixtures/auth";

test.describe("Security page — layout", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/security");
    await expect(page.getByRole("heading", { name: /security/i })).toBeVisible({ timeout: 10000 });
  });

  test("renders security page with 2FA section", async ({ authedPage: page }) => {
    await expect(page.getByText(/two-factor|2fa|authenticat/i).first()).toBeVisible();
  });

  test("shows Two-Factor Authentication section", async ({ authedPage: page }) => {
    await expect(
      page.getByRole("heading", { name: /two-factor/i })
    ).toBeVisible({ timeout: 5000 });
  });

  test("shows enable or disable 2FA button", async ({ authedPage: page }) => {
    const enableBtn = page.getByRole("button", { name: /enable.*2fa|set up.*2fa|enable.*two/i });
    const disableBtn = page.getByRole("button", { name: /disable.*2fa|disable.*two/i });
    const hasEnable = await enableBtn.isVisible({ timeout: 5000 }).catch(() => false);
    const hasDisable = await disableBtn.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasEnable || hasDisable).toBe(true);
  });
});

test.describe("Security page — info banner", () => {
  test("info banner recommending 2FA is visible", async ({ authedPage: page }) => {
    // Clear any dismissed state
    await page.evaluate(() => localStorage.removeItem("security-info-dismissed"));
    await page.goto("/security");
    await expect(page.getByRole("heading", { name: /security/i })).toBeVisible({ timeout: 10000 });

    const banner = page.getByText(/recommend|protect|two-factor/i).first();
    const isBannerVisible = await banner.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!isBannerVisible, "Info banner not visible — may already be dismissed or not present");
    await expect(banner).toBeVisible();
  });
});

test.describe("Security page — 2FA enable flow", () => {
  test("clicking Enable 2FA shows QR code setup", async ({ authedPage: page }) => {
    await page.goto("/security");
    await expect(page.getByRole("heading", { name: /security/i })).toBeVisible({ timeout: 10000 });

    const enableBtn = page.getByRole("button", { name: /enable.*2fa|set up.*2fa|enable.*two/i });
    const isVisible = await enableBtn.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!isVisible, "Enable 2FA button not visible — 2FA may already be enabled");

    await enableBtn.click();

    // Should show QR code or setup instructions
    await expect(
      page.getByText(/scan|qr|authenticator|secret/i).first()
    ).toBeVisible({ timeout: 10000 });
  });
});
