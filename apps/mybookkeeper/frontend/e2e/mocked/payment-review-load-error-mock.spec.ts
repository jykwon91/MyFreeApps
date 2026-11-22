/**
 * No-backend E2E for Payment Review when its queue fails to load.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts.
 *
 * The page used to read a failed load as an empty queue and said "All caught
 * up". It must show the error with Retry, hold it while the retry runs (RTK
 * clears the error the moment a retry starts), and show the real answer after.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { failUntilRecovered } from "./fixtures/flakyEndpoint";

const ERROR = "I couldn't load your payments to review.";
const CAUGHT_UP = "All caught up — no payments need your review.";

test("payment review: shows the error with Retry, never 'All caught up', until the queue loads", async ({ page }) => {
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "admin");
  const queue = await failUntilRecovered(page, /\/api\/transactions\/attribution-review-queue(\?|$)/, {
    items: [],
    total: 0,
    pending_count: 0,
  });
  await page.goto("/payment-review");

  await expect(page.getByText(ERROR)).toBeVisible();
  await expect(page.getByText(CAUGHT_UP)).toHaveCount(0);

  queue.recover();
  const before = queue.loads();
  await page.getByRole("button", { name: "Retry", exact: true }).click();

  await expect(page.getByRole("button", { name: "Retrying...", exact: true })).toBeDisabled();
  await expect(page.getByText(CAUGHT_UP)).toHaveCount(0);
  await expect.poll(queue.loads).toBeGreaterThan(before);

  queue.release();
  await expect(page.getByText(CAUGHT_UP)).toBeVisible();
  await expect(page.getByText(ERROR)).toHaveCount(0);
});
