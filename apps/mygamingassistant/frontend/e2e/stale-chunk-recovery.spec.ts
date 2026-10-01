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
 * Run: npm run test:e2e -- stale-chunk-recovery
 */
import { test, expect } from "@playwright/test";

// Matches the lazy page module in both dev (`/src/.../WowProfessionsPage.tsx`)
// and a production build (`/assets/WowProfessionsPage-<hash>.js`).
const PROFESSIONS_CHUNK = /WowProfessionsPage[^/]*\.(tsx|js)(\?.*)?$/;

test("a chunk removed by a deploy reloads once, then offers a manual reload", async ({ page }) => {
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

  // No reload loop: nothing else happens while the prompt is showing.
  await page.waitForTimeout(1_500);
  expect(documentLoads).toBe(2);

  // The new build's chunk is available — the Reload button recovers the page.
  await page.unroute(PROFESSIONS_CHUNK);
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.getByRole("radio", { name: "Cooking" })).toBeChecked();
  expect(documentLoads).toBe(3);
});
