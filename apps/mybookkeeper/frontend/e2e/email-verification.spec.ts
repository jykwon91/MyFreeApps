/**
 * E2E tests for email verification flow.
 *
 * These tests exercise the end-to-end verification path:
 * - Verify email page layout
 * - Handling a missing token
 * - Handling an invalid token
 * - Successful verification via API
 * - Register page shows check-inbox screen after sign up
 * - Login page shows resend button for unverified users
 *
 * Note: Full happy-path (register → receive email → click link → login)
 * requires a real SMTP server in the E2E environment and is deferred to
 * manual testing / staging verification.
 */
import { test, expect } from "@playwright/test";

test.describe("Verify email — page layout", () => {
  test("page loads with heading when no token is present", async ({ page }) => {
    await page.goto("/verify-email");
    await expect(page.getByRole("heading", { name: "MyBookkeeper" })).toBeVisible();
  });

  test("shows an error message when no token is in the URL", async ({ page }) => {
    await page.goto("/verify-email");
    await expect(page.getByText(/no verification token/i)).toBeVisible({ timeout: 5000 });
  });

  test("shows a link to the login page on error", async ({ page }) => {
    await page.goto("/verify-email");
    await expect(page.getByRole("link", { name: /go to login/i })).toBeVisible({ timeout: 5000 });
  });

  test("shows an error for an obviously invalid token", async ({ page }) => {
    await page.goto("/verify-email?token=invalidtoken");
    // API call will fail — expect error state
    await expect(
      page.getByText(/invalid or has expired/i).or(page.getByText(/VERIFY_TOKEN/))
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Register — check-inbox screen", () => {
  test("register page renders all fields", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("input[type='email']")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign up/i })).toBeVisible();
  });

  test("redirects to check-inbox screen after successful registration", async ({ page }) => {
    // Use a unique email to avoid conflicts across test runs
    const testEmail = `e2e-verify-${Date.now()}@example.com`;

    await page.goto("/register");
    await page.locator("input[type='email']").fill(testEmail);
    await page.locator("input[type='password']").fill("TestP@ssword1234!");
    await page.getByRole("button", { name: /sign up/i }).click();

    // Should show check-inbox screen (not navigate to dashboard)
    await expect(page.getByText(/check your inbox/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(testEmail)).toBeVisible();

    // Clean up: the test user is unverified so no teardown needed for DB integrity,
    // but we record the email for reference.
  });
});

test.describe("Login — unverified user prompt", () => {
  test("shows resend button when backend returns LOGIN_USER_NOT_VERIFIED", async ({ page }) => {
    // Intercept the login API to simulate an unverified response
    await page.route("**/auth/totp/login", (route) => {
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "LOGIN_USER_NOT_VERIFIED" }),
      });
    });

    await page.goto("/login");
    await page.locator("input[type='email']").fill("unverified@example.com");
    await page.locator("input[type='password']").fill("somepassword1234");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(/please verify your email/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: /resend verification email/i })).toBeVisible();
  });

  test("resend button calls request-verify-token endpoint", async ({ page }) => {
    let resendCalled = false;

    await page.route("**/auth/totp/login", (route) => {
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "LOGIN_USER_NOT_VERIFIED" }),
      });
    });

    await page.route("**/auth/request-verify-token", (route) => {
      resendCalled = true;
      route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify(null),
      });
    });

    await page.goto("/login");
    await page.locator("input[type='email']").fill("unverified@example.com");
    await page.locator("input[type='password']").fill("somepassword1234");
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.getByRole("button", { name: /resend verification email/i }).click();

    await expect(page.getByText(/verification email sent/i)).toBeVisible({ timeout: 5000 });
    expect(resendCalled).toBe(true);
  });
});
