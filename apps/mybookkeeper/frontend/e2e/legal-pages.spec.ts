import { test, expect } from "@playwright/test";

test.describe("Legal pages — public access", () => {
  test("Privacy Policy page loads without auth", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: /privacy policy/i })).toBeVisible();
  });

  test("Privacy Policy shows last-updated date", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByText(/2026-04-25/)).toBeVisible();
  });

  test("Privacy Policy shows contact email", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("link", { name: /jasonykwon91@gmail\.com/i }).first()).toBeVisible();
  });

  test("Privacy Policy shows Who we are section", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: /who we are/i })).toBeVisible();
  });

  test("Privacy Policy shows Your rights section", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: /your rights/i })).toBeVisible();
  });

  test("Terms of Service page loads without auth", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: /terms of service/i })).toBeVisible();
  });

  test("Terms of Service shows last-updated date", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByText(/2026-04-25/)).toBeVisible();
  });

  test("Terms of Service shows contact email", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("link", { name: /jasonykwon91@gmail\.com/i }).first()).toBeVisible();
  });

  test("Terms of Service shows Disclaimers section", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: /disclaimers/i })).toBeVisible();
  });
});

test.describe("Legal pages — footer links from public pages", () => {
  test("Login page has a Privacy Policy footer link", async ({ page }) => {
    await page.goto("/login");
    const link = page.getByRole("link", { name: /privacy policy/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/privacy");
  });

  test("Login page has a Terms of Service footer link", async ({ page }) => {
    await page.goto("/login");
    const link = page.getByRole("link", { name: /terms of service/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/terms");
  });

  test("Login page footer Privacy Policy link navigates to /privacy", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /privacy policy/i }).click();
    await expect(page).toHaveURL(/\/privacy/);
    await expect(page.getByRole("heading", { name: /privacy policy/i })).toBeVisible();
  });

  test("Register page has a Privacy Policy footer link", async ({ page }) => {
    await page.goto("/register");
    const link = page.getByRole("link", { name: /privacy policy/i }).last();
    await expect(link).toBeVisible();
  });

  test("Register page has a Terms of Service footer link", async ({ page }) => {
    await page.goto("/register");
    const link = page.getByRole("link", { name: /terms of service/i }).last();
    await expect(link).toBeVisible();
  });
});

test.describe("Register — terms acceptance checkbox", () => {
  test("Sign up button is disabled before terms checkbox is checked", async ({ page }) => {
    await page.goto("/register");
    const submitButton = page.getByRole("button", { name: /sign up/i });
    await expect(submitButton).toBeDisabled();
  });

  test("Sign up button becomes enabled after checking terms checkbox", async ({ page }) => {
    await page.goto("/register");
    await page.getByTestId("terms-checkbox").check();
    const submitButton = page.getByRole("button", { name: /sign up/i });
    await expect(submitButton).toBeEnabled();
  });

  test("terms checkbox label links to /terms", async ({ page }) => {
    await page.goto("/register");
    const termsLink = page.getByRole("link", { name: /terms of service/i }).first();
    await expect(termsLink).toHaveAttribute("href", "/terms");
  });

  test("terms checkbox label links to /privacy", async ({ page }) => {
    await page.goto("/register");
    const privacyLink = page.getByRole("link", { name: /privacy policy/i }).first();
    await expect(privacyLink).toHaveAttribute("href", "/privacy");
  });
});
