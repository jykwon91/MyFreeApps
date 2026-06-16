import { test, expect } from "@playwright/test";

// Regression guard for the react-router duplicate-context crash.
//
// /support-myfreeapps renders the shared `@platform/ui` Support page, whose <Link> reads
// React Router's context. When MBK was pinned to react-router-dom v6 while the
// shared package used v7, two physical react-router copies existed: MBK's
// <BrowserRouter> populated one RouterContext, but the shared <Link> read the
// other (unprovided) one, throwing `TypeError: useContext(...) is null` — caught
// by the app ErrorBoundary, which then stayed stuck on back-navigation.
//
// Aligning MBK to react-router-dom v7 collapses the workspace to a single copy,
// so the contexts unify and the page renders. These tests fail loudly if that
// drift ever returns.

test.describe("Support page — public", () => {
  test("renders without crashing (react-router context regression guard)", async ({ page }) => {
    await page.goto("/support-myfreeapps");
    await expect(
      page.getByRole("heading", { name: /please support myfreeapps/i }),
    ).toBeVisible();
    // The ErrorBoundary fallback must NOT appear.
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  });

  test("is reachable from the footer Support MyFreeApps link", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /^support myfreeapps$/i }).click();
    await expect(page).toHaveURL(/\/support-myfreeapps/);
    await expect(
      page.getByRole("heading", { name: /please support myfreeapps/i }),
    ).toBeVisible();
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  });
});
