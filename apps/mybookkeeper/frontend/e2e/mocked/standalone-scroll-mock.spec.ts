/**
 * No-backend E2E: a page outside the app shell (StandaloneLayout) opens at the
 * top. MBK's window scrolls (its body isn't locked to the viewport), so
 * resetting only the <main>'s scrollTop left the next page as far down as the
 * last one.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

test.describe("standalone pages", () => {
  test.use({ viewport: { width: 390, height: 400 } });

  test("open at the top after scrolling down the previous one", async ({ page }) => {
    await stubUnmatchedApi(page, { answer: "empty" });
    await page.goto("/register");
    const signIn = page.getByRole("link", { name: "Sign in" }).last();
    await expect(signIn).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await signIn.click();

    await expect(page).toHaveURL(/\/login$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    expect(await page.getByRole("main").evaluate((main) => main.scrollTop)).toBe(0);
  });
});
