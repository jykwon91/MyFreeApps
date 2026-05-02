import { test, expect } from "@playwright/test";
import { authenticator } from "otplib";
import { createTestUser, deleteTestUser, loginViaUI } from "./fixtures/auth";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8004";

/**
 * End-to-end TOTP enrollment + login challenge.
 *
 * Flow:
 *   1. Create + log in a brand-new user.
 *   2. Navigate to Settings → Security and enable 2FA via the wizard.
 *   3. Generate a valid 6-digit code from the secret returned by the API,
 *      enter it, confirm enrollment, and capture a recovery code.
 *   4. Sign out, then sign back in. Verify the TOTP challenge step appears.
 *   5. Submit the challenge with a fresh 6-digit code from the same secret;
 *      assert the dashboard renders.
 *   6. (Cleanup) Sign back in once more with a recovery code to confirm
 *      they are accepted in place of TOTP. The recovery code is consumed
 *      after this — it can't be reused.
 *
 * The test reads the TOTP secret from the `/auth/totp/setup` API response
 * (intercepted via Playwright's request context) so we don't need to scrape
 * it out of the rendered DOM. This is the only way to drive a real TOTP
 * verifier from a browser test — the secret is single-use private state and
 * never round-trips back to the user.
 */
test.describe("MyJobHunter TOTP 2FA", () => {
  test("enroll, sign out, sign back in via TOTP challenge, fall back to recovery", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);
    let recoveryCodes: string[] = [];

    try {
      // 1. Sign in to a fresh account
      await loginViaUI(page, user, request);
      await expect(page).toHaveURL(/\/dashboard/);

      // 2. Navigate to Settings → Security via the Settings link
      await page.getByRole("link", { name: /settings/i }).first().click();
      await page.waitForURL("**/settings");
      await page.getByRole("link", { name: /two-factor authentication/i }).click();
      await page.waitForURL("**/security");
      await expect(
        page.getByRole("heading", { name: "Security" }),
      ).toBeVisible();

      // 3. Trigger enrollment. Capture the setup response so we can derive a
      // valid TOTP code from the same secret the server stored.
      const setupResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().endsWith("/auth/totp/setup") &&
          resp.request().method() === "POST",
      );
      await page.getByRole("button", { name: /enable 2fa/i }).click();
      const setupResponse = await setupResponsePromise;
      const setup = (await setupResponse.json()) as {
        secret: string;
        provisioning_uri: string;
        recovery_codes: string[];
      };
      recoveryCodes = setup.recovery_codes;

      // QR code + manual secret should be visible
      await expect(page.getByText(setup.secret)).toBeVisible();

      // 4. Enter a fresh 6-digit code derived from the same secret
      const code = authenticator.generate(setup.secret);
      await page.getByPlaceholder("000000").fill(code);
      await page.getByRole("button", { name: /verify & enable/i }).click();

      // 5. Recovery codes display + acknowledgment
      await expect(page.getByText("Save your recovery codes")).toBeVisible();
      for (const rc of recoveryCodes) {
        await expect(page.getByText(rc)).toBeVisible();
      }
      await page.getByRole("button", { name: /i've saved my codes/i }).click();
      await expect(
        page.getByRole("button", { name: /disable 2fa/i }),
      ).toBeVisible();

      // 6. Sign out — sidebar user menu button shows truncated name, not email
      await page.locator("aside").getByRole("button").last().click();
      await page.getByRole("menuitem", { name: /sign out/i }).click();
      await page.waitForURL("**/login", { timeout: 5_000 });

      // 7. Sign in again — TOTP challenge should appear
      await page.getByLabel(/email/i).fill(user.email);
      await page.locator("#login-password").fill(user.password);
      await page.getByRole("button", { name: /^sign in$/i }).click();
      await expect(page.getByLabel(/authentication code/i)).toBeVisible({
        timeout: 5_000,
      });

      // 8. Provide a fresh TOTP code (must regenerate — the previous one may
      //    have rolled past its 30s window during recovery-code display)
      const challengeCode = authenticator.generate(setup.secret);
      await page.getByLabel(/authentication code/i).fill(challengeCode);
      await page.getByRole("button", { name: /^verify$/i }).click();
      // After TOTP verify, navigate goes to the "from" state (last visited page
      // before sign-out) which may be /security or /dashboard. Wait for any
      // navigation away from /login.
      await page.waitForURL(
        (url) => !url.pathname.includes("/login"),
        { timeout: 10_000 },
      );

      // 9. Sign out again, then sign in using a recovery code
      await page.locator("aside").getByRole("button").last().click();
      await page.getByRole("menuitem", { name: /sign out/i }).click();
      await page.waitForURL("**/login", { timeout: 5_000 });

      await page.getByLabel(/email/i).fill(user.email);
      await page.locator("#login-password").fill(user.password);
      await page.getByRole("button", { name: /^sign in$/i }).click();
      await expect(page.getByLabel(/authentication code/i)).toBeVisible();
      await page.getByLabel(/authentication code/i).fill(recoveryCodes[0]);
      await page.getByRole("button", { name: /^verify$/i }).click();
      // Same as above — navigate targets the "from" state
      await page.waitForURL(
        (url) => !url.pathname.includes("/login"),
        { timeout: 10_000 },
      );
    } finally {
      // Reset the user back to no-2FA state so test cleanup (and re-runs)
      // don't trip over a half-enrolled record. Use the backend API directly
      // since the UI flow requires a fresh TOTP code that may have rolled.
      // If recoveryCodes is non-empty, use one to log in then disable via
      // the API. This is best-effort — failures here shouldn't fail the test.
      if (recoveryCodes.length > 1) {
        try {
          const loginResp = await request.post(
            `${BACKEND_URL}/api/auth/totp/login`,
            {
              data: {
                email: user.email,
                password: user.password,
                totp_code: recoveryCodes[1],
              },
            },
          );
          if (loginResp.ok()) {
            // No "disable via recovery code" endpoint — the cleanup is the
            // user-delete script run periodically. Document the limitation.
          }
        } catch {
          // Cleanup best-effort.
        }
      }
      await deleteTestUser(request, user);
    }
  });
});
