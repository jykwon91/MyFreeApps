import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/auth";
import { resetAuthRateLimits } from "./fixtures/auth-rate-limits";
import { BACKEND_URL } from "./fixtures/config";
import { totpCode } from "@platform/ui/test-support/totpCode";

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
    await expect(enableBtn.or(disableBtn)).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Security page — info banner", () => {
  const bannerText = /We recommend enabling it since your account contains sensitive financial data/;

  test("shows the 2FA recommendation until dismissed, and stays dismissed after reload", async ({ authedPage: page }) => {
    await page.goto("/security");
    await page.evaluate(() => localStorage.removeItem("security-info-dismissed"));
    await page.reload();
    await expect(page.getByRole("heading", { name: /security/i })).toBeVisible({ timeout: 10000 });

    const banner = page.getByText(bannerText);
    await expect(banner).toBeVisible();

    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(banner).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("security-info-dismissed"))).toBe("1");

    await page.reload();
    await expect(page.getByRole("heading", { name: /security/i })).toBeVisible({ timeout: 10000 });
    await expect(banner).toHaveCount(0);

    await page.evaluate(() => localStorage.removeItem("security-info-dismissed"));
  });
});

test.describe("Security page — 2FA enable flow", () => {
  // Its own account: the shared E2E user logs in from other specs running at the
  // same time, and would be stuck behind two-step sign-in if this failed midway.
  const password = "E2eTwoStepT3st!Secure";

  async function signUpAndSignIn(page: Page, email: string): Promise<string> {
    const json = { "Content-Type": "application/json" };
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(`${BACKEND_URL}${path}`, {
        method: "POST",
        headers: { ...json, ...headers },
        body: JSON.stringify(body),
      });

    await resetAuthRateLimits();
    const registered = await post("/auth/register", { email, password, name: "Two Step Test" });
    expect(registered.ok, await registered.text()).toBe(true);
    expect((await post("/test/verify-email", { email })).ok).toBe(true);
    const { access_token: token } = (await (await post("/auth/totp/login", { email, password })).json()) as {
      access_token: string;
    };
    const auth = { Authorization: `Bearer ${token}` };
    const { id: orgId } = (await (await post("/organizations", { name: "Two Step Test" }, auth)).json()) as {
      id: string;
    };
    await post(
      "/tax-profile/complete-onboarding",
      { tax_situations: ["rental_property"], filing_status: "single", dependents_count: 0 },
      { ...auth, "X-Organization-Id": orgId },
    );

    await page.goto("/login");
    await page.evaluate(
      ([t, o]) => {
        localStorage.setItem("token", t);
        localStorage.setItem("v1_activeOrgId", o);
      },
      [token, orgId],
    );
    return token;
  }

  test("enabling asks for the password, then turning on and off works", async ({ page }) => {
    const email = `e2e-two-step-${Date.now()}@example.com`;
    const token = await signUpAndSignIn(page, email);
    let secret = "";
    let setupCalls = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/auth/totp/setup")) setupCalls += 1;
    });

    try {
      await page.goto("/security");
      await expect(page.getByRole("heading", { name: /security/i })).toBeVisible({ timeout: 10000 });

      const enableBtn = page.getByRole("button", { name: /enable 2fa/i });
      await expect(enableBtn).toBeVisible({ timeout: 10000 });
      await enableBtn.click();

      // A wrong password is refused and starts nothing.
      await page.getByLabel("Enter your password to continue").fill("not-the-password");
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByText("Incorrect password")).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/scan this qr code/i)).toBeHidden();

      // The right one shows the key and the settings for typing it by hand.
      const setupResponse = page.waitForResponse((r) => r.url().endsWith("/auth/totp/setup") && r.ok());
      await page.getByLabel("Enter your password to continue").fill(password);
      await page.getByRole("button", { name: "Continue" }).click();
      ({ secret } = (await (await setupResponse).json()) as { secret: string });
      await expect(page.getByText(secret)).toBeVisible();
      await expect(page.getByText("If you enter it by hand: time-based, SHA256, 6 digits, 30 seconds.")).toBeVisible();
      // One for each press of Continue: opening the step sent nothing.
      expect(setupCalls).toBe(2);

      await page.getByPlaceholder("000000").fill(totpCode(secret));
      await page.getByRole("button", { name: "Verify & Enable" }).click();
      await expect(page.getByText("Save your recovery codes")).toBeVisible({ timeout: 10000 });
      await page.getByRole("button", { name: /i've saved my codes/i }).click();
      await expect(page.getByRole("button", { name: /disable 2fa/i })).toBeVisible();

      // The code just used can't be spent twice, so this takes the next one.
      await page.getByRole("button", { name: /disable 2fa/i }).click();
      await page.getByPlaceholder("000000").fill(totpCode(secret, 1));
      await page.getByRole("button", { name: /disable 2fa/i }).last().click();
      await expect(page.getByRole("button", { name: /enable 2fa/i })).toBeVisible({ timeout: 10000 });
    } finally {
      const deleted = await fetch(`${BACKEND_URL}/users/me`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          password,
          confirm_email: email,
          totp_code: secret ? totpCode(secret, 1) : null,
        }),
      });
      expect(deleted.ok, "the test account should be cleaned up").toBe(true);
    }
  });
});
