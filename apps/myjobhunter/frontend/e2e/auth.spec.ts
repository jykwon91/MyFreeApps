import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, resetRateLimit } from "./fixtures/auth";

test.describe("Email verification at registration", () => {
  test("unverified user cannot login; resend banner appears; verified user can", async ({
    page,
    request,
  }) => {
    // 1. Register a user but DO NOT auto-verify
    const user = await createTestUser(request, { verify: false });

    try {
      // Reset rate limit so this test starts with a clean slate
      await resetRateLimit(request);

      // 2. Clear any stale auth token so the Login page doesn't auto-redirect
      //    to /dashboard before we can attempt the unverified login.
      //    The /verify-email route has no RequireAuth wrapper, so we can
      //    safely navigate there first and clear localStorage before the
      //    Login page's useEffect can fire.
      await page.goto("/verify-email");
      await page.evaluate(() => localStorage.removeItem("token"));
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(user.email);
      await page.locator("#login-password").fill(user.password);
      await page.getByRole("button", { name: /sign in/i }).click();

      // 3. The Login page surfaces the resend banner with a button
      await expect(
        page.getByTestId("resend-verification-banner"),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /resend verification email/i }),
      ).toBeVisible();

      // Confirm we are still on /login (not redirected)
      await expect(page).toHaveURL(/\/login/);

      // 4. Click "Resend verification email" — banner switches to sent state
      await page
        .getByRole("button", { name: /resend verification email/i })
        .click();
      await expect(
        page.getByTestId("resend-verification-sent"),
      ).toBeVisible();

      // 5. Force-verify via the test helper (simulates the user clicking the email link)
      await request.post(
        `${process.env.BACKEND_URL ?? "http://localhost:8004"}/api/_test/verify-email`,
        { data: { email: user.email } },
      );

      // 6. Login again — should succeed and reach /dashboard
      await page.getByLabel(/email/i).fill(user.email);
      await page.locator("#login-password").fill(user.password);
      await page.getByRole("button", { name: /sign in/i }).click();
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("registration shows 'check your inbox' banner and does NOT auto-login", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const email = `e2e-register-${timestamp}@myjobhunter-test.example.com`;
    const password = `TestPass${timestamp}!`;

    // Clear stale auth so Login doesn't auto-redirect before the form renders.
    // Navigate to a public route first so we can safely clear localStorage
    // before React's isAuthenticated useEffect fires.
    await page.goto("/verify-email");
    await page.evaluate(() => localStorage.removeItem("token"));
    await page.goto("/login");
    await page.getByRole("tab", { name: /create account/i }).click();
    await page.getByLabel(/email/i).fill(email);
    // The Create Account tab password field — scoped by the visible tab panel
    await page.getByRole("tabpanel").locator("#login-password").fill(password);
    await page.getByRole("button", { name: /^create account$/i }).click();

    await expect(
      page.getByTestId("registration-success-banner"),
    ).toBeVisible();
    await expect(
      page.getByTestId("registration-success-banner"),
    ).toContainText(email);

    // Must NOT redirect to dashboard — verification gate is in effect
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Verify email page", () => {
  test("invalid token shows the error state", async ({ page }) => {
    await page.goto("/verify-email?token=garbage");
    await expect(page.getByText(/couldn't verify/i)).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.getByRole("link", { name: /go to sign in/i }),
    ).toBeVisible();
  });

  test("missing token shows a friendly error", async ({ page }) => {
    await page.goto("/verify-email");
    await expect(
      page.getByText(/no verification token found/i),
    ).toBeVisible();
  });
});
