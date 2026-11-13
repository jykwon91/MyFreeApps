/**
 * Stale-chunk recovery after a deploy.
 *
 * Regression: a tab opened BEFORE a deploy navigated to a lazy route AFTER it
 * and died on React Router's raw "Unexpected Application Error! error loading
 * dynamically imported module: .../assets/WowProfessionsPage-<hash>.js" —
 * the deploy had removed that chunk.
 *
 * The test simulates the deploy by making the lazy page's module 404, then
 * asserts the recovery: the tab reloads itself exactly ONCE (never loops),
 * and if the chunk is still missing it shows the "new version" prompt whose
 * Reload button recovers once the chunk is available again.
 *
 * The first failure reloads, so it's recovery, not a crash. The second, which
 * the reload guard declines, leaves the page on the prompt: the error screen
 * announces that one, so this spec allows it and checks it was announced.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts stale-chunk-recovery
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

// Matches the lazy page module in both dev (`/src/.../WowProfessionsPage.tsx`)
// and a production build (`/assets/WowProfessionsPage-<hash>.js`).
const PROFESSIONS_CHUNK = /WowProfessionsPage[^/]*\.(tsx|js)(\?.*)?$/;

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.use({ allowCrashes: true });

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("a chunk removed by a deploy reloads once, then offers a manual reload", async ({ page, pageCrashes }) => {
  let documentLoads = 0;
  page.on("load", () => {
    documentLoads += 1;
  });

  await page.goto("/wow-forever");
  await expect(page.getByRole("link", { name: /^Professions/ })).toBeVisible();
  expect(documentLoads).toBe(1);

  // "Deploy": the professions chunk this tab would load no longer exists.
  let chunkRequests = 0;
  await page.route(PROFESSIONS_CHUNK, async (route) => {
    chunkRequests += 1;
    await route.fulfill({ status: 404, body: "" });
  });

  await page.getByRole("link", { name: /^Professions/ }).click();

  // One automatic reload, then the prompt — not the router's dev error page.
  await expect(page.getByRole("heading", { name: "A new version was released" })).toBeVisible();
  await expect(page.getByText(/Unexpected Application Error/i)).toHaveCount(0);
  await expect(page).toHaveURL(/\/wow-forever\/professions$/);
  expect(documentLoads).toBe(2);
  expect(chunkRequests).toBe(2);

  // Only the failure the guard declined to reload for was announced, as a crash of the professions chunk.
  await expect.poll(() => pageCrashes.length).toBeGreaterThan(0);
  for (const crash of pageCrashes) {
    expect(crash).toMatch(/^caught by RouteErrorFallback: TypeError: Failed to fetch dynamically imported module: \S*WowProfessionsPage/);
  }

  // No reload loop: nothing else happens while the prompt is showing.
  await page.waitForTimeout(1_500);
  expect(documentLoads).toBe(2);

  // The new build's chunk is available — the Reload button recovers the page.
  await page.unroute(PROFESSIONS_CHUNK);
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.getByRole("radio", { name: "Cooking" })).toBeChecked();
  expect(documentLoads).toBe(3);
});
