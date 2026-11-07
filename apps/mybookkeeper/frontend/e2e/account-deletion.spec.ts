/**
 * E2E: deleting your account from Security. Uses a fresh, verified account that
 * owns a workspace of its own, which is what every sign-up gets.
 */
import { test, expect } from "@playwright/test";
import { BACKEND_URL } from "./fixtures/config";
import { SoloOrg } from "./fixtures/solo-org";

test.describe("Account deletion", () => {
  test("deleting my account signs me out, ends my session and blocks signing back in", async ({ page, playwright }) => {
    const solo = await SoloOrg.create(playwright, "account-deletion");
    const { email, password, authHeader } = solo.account;
    let deleted = false;
    try {
      await solo.signIn(page);
      await page.goto("/security");
      await page.getByRole("button", { name: /delete my account/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      const deleteForever = dialog.getByRole("button", { name: /delete forever/i });
      await dialog.getByLabel(/type your email/i).fill(email);
      await dialog.getByLabel(/password/i).fill(password);
      await deleteForever.click();

      await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
      deleted = true;
      expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();

      const anon = await playwright.request.newContext({ baseURL: BACKEND_URL });
      try {
        expect((await anon.get("/users/me", { headers: authHeader })).status()).toBe(401);
      } finally {
        await anon.dispose();
      }

      await page.locator("input[type='email']").fill(email);
      await page.locator("input[type='password']").fill(password);
      await page.getByRole("button", { name: /sign in/i }).click();
      await expect(page.getByText("Incorrect email or password. Please try again.")).toBeVisible();
    } finally {
      if (deleted) await solo.api.dispose();
      else await solo.delete(playwright);
    }
  });
});
