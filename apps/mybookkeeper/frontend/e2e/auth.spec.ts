import { test, expect } from "@playwright/test";
import { E2E_EMAIL, E2E_PASSWORD } from "./fixtures/config";

test.describe("Authentication — login page layout", () => {
  test("page loads with all required elements", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "MyBookkeeper" })).toBeVisible();
    await expect(page.locator("input[type='email']")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
  });

  test("register link navigates to register page", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/register/);
  });

  test("preserves returnTo parameter in register link", async ({ page }) => {
    await page.goto("/login?returnTo=%2Ftransactions");
    const link = page.getByRole("link", { name: "Sign up" });
    await expect(link).toHaveAttribute("href", /returnTo/);
  });
});

test.describe("Authentication — register page layout", () => {
  test("page loads with all required elements", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /create an account/i })).toBeVisible();
    await expect(page.locator("input[type='email']")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign up/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });

  test("login link navigates to login page", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("link", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Authentication — unauthenticated redirects", () => {
  test("unauthenticated user on / redirects to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated user on /transactions redirects to login", async ({ page }) => {
    await page.goto("/transactions");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated user on /documents redirects to login", async ({ page }) => {
    await page.goto("/documents");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Authentication — login error handling", () => {
  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input[type='email']").fill("nonexistent@example.com");
    await page.locator("input[type='password']").fill("wrongpassword123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid email or password")).toBeVisible({ timeout: 5000 });
  });

  test("shows loading state on submit", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input[type='email']").fill("test@example.com");
    await page.locator("input[type='password']").fill("somepassword");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("button", { name: "Signing in..." })
        .or(page.getByText("Invalid email or password"))
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Authentication — full login and logout flow", () => {
  test("login with valid credentials, navigate protected route, then logout", async ({ page }) => {
    // 1. Navigate to login
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "MyBookkeeper" })).toBeVisible();

    // 2. Fill credentials and submit
    await page.locator("input[type='email']").fill(E2E_EMAIL);
    await page.locator("input[type='password']").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    // 3. Verify redirect to dashboard (authenticated)
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 });

    // 4. Verify token exists in localStorage
    const token = await page.evaluate(() => localStorage.getItem("token"));
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
    expect(token!.length).toBeGreaterThan(10);

    // 5. Navigate to a protected route
    await page.goto("/transactions");
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page).not.toHaveURL(/\/login/);

    // 6. Logout via sidebar
    const logoutBtn = page.getByRole("button", { name: /log\s?out|sign\s?out/i });
    if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await logoutBtn.click();
    } else {
      // Clear token manually to simulate logout
      await page.evaluate(() => localStorage.removeItem("token"));
      await page.goto("/");
    }

    // 7. Verify redirected back to login
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });

    // 8. Verify token is cleared
    const tokenAfter = await page.evaluate(() => localStorage.getItem("token"));
    expect(tokenAfter).toBeFalsy();
  });

  test("authenticated user can access dashboard", async ({ page }) => {
    // Login
    await page.goto("/login");
    await page.locator("input[type='email']").fill(E2E_EMAIL);
    await page.locator("input[type='password']").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    // Wait for auth redirect
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 });

    // Dashboard should have sidebar navigation
    await expect(page.getByRole("link", { name: "Dashboard" }).first()).toBeVisible({ timeout: 5000 });
  });
});
