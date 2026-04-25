import { test, expect } from "@playwright/test";

test.describe("Forgot Password — page layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/forgot-password");
  });

  test("renders the forgot password page", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "MyBookkeeper" })
    ).toBeVisible();
    await expect(page.getByText("send you a link")).toBeVisible();
  });

  test("has email input and submit button", async ({ page }) => {
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send reset link" })
    ).toBeVisible();
  });

  test("has back to sign in link", async ({ page }) => {
    const link = page.getByRole("link", { name: "Back to sign in" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("submitting email shows confirmation message", async ({ page }) => {
    await page.getByLabel("Email").fill("test@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("Check your email")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("test@example.com")).toBeVisible();
  });
});

test.describe("Reset Password — page layout", () => {
  test("shows invalid link when no token provided", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText("Invalid link")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Request new link" })
    ).toBeVisible();
  });

  test("renders reset form when token is present", async ({ page }) => {
    await page.goto("/reset-password?token=test-token");
    await expect(
      page.getByRole("heading", { name: "MyBookkeeper" })
    ).toBeVisible();
    await expect(page.getByLabel("New password")).toBeVisible();
    await expect(page.getByLabel("Confirm password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reset password" })
    ).toBeVisible();
  });

  test("shows error for mismatched passwords", async ({ page }) => {
    await page.goto("/reset-password?token=test-token");
    await page.getByLabel("New password").fill("newpassword123");
    await page.getByLabel("Confirm password").fill("different123");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText("do not match")).toBeVisible();
  });

  test("password fields enforce minimum length", async ({ page }) => {
    await page.goto("/reset-password?token=test-token");
    const passwordInput = page.getByLabel("New password");
    await expect(passwordInput).toHaveAttribute("minlength", "12");
    const confirmInput = page.getByLabel("Confirm password");
    await expect(confirmInput).toHaveAttribute("minlength", "12");
  });

  test("shows password strength hint", async ({ page }) => {
    await page.goto("/reset-password?token=test-token");
    await expect(page.getByText("At least 12 characters")).toBeVisible();
  });

  test("clears token from URL after page load", async ({ page }) => {
    await page.goto("/reset-password?token=test-token");
    await expect(page.getByLabel("New password")).toBeVisible();
    await page.waitForTimeout(500);
    const url = page.url();
    expect(url).not.toContain("token=");
  });
});

test.describe("Login — forgot password link", () => {
  test("login page has forgot password link", async ({ page }) => {
    await page.goto("/login");
    const link = page.getByRole("link", { name: "Forgot password?" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/forgot-password/);
  });
});
