/**
 * No-backend E2E for /service: the active drop's dashboard loads one column
 * per pickup slot with its orders, the skeleton has the loaded layout in both
 * loading states, a failed load of the drops or the dashboard
 * offers a retry, and advancing an order sends the new status and shows it.
 *
 * The dashboard polls every few seconds, and a poll would reload it whether or
 * not Retry or the advance's cache invalidation work. So the dashboard reads
 * are logged: the action must cause exactly one more read, sooner after the
 * previous read than a poll can come. (Pausing the page clock instead stops
 * the store's requestAnimationFrame-batched updates, so the page never renders.)
 */
import type { Page } from "@playwright/test";
import { apiPath } from "@platform/ui/test-support/apiPath";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { measureBoxes } from "@platform/ui/test-support/layoutShift";
import { failReads, holdReads, logReads } from "@platform/ui/test-support/routeControls";
import { toast } from "@platform/ui/test-support/toast";
import type { LoggedRead } from "@platform/ui/test-support/types/LoggedRead";
import { DASHBOARD_POLL_INTERVAL_MS } from "./constants/servicePolling";
import { ACTIVE_DROP_ID } from "./fixtures/dropFixtures";
import { FIRST_ORDER_ID } from "./fixtures/serviceFixtures";
import { expectSameColumns, skeletonCards } from "./fixtures/skeletonLayout";
import { stubDropsApi } from "./fixtures/stubDropsApi";
import { stubServiceApi } from "./fixtures/stubServiceApi";

const DROPS_LIST = apiPath(/^\/drops$/);
const DASHBOARD_READ = apiPath(/^\/service\/drops\/[^/]+$/);

/** The action caused the one read after the first: it came before any poll could. */
async function expectReadCausedByAction(reads: LoggedRead[]): Promise<void> {
  await expect.poll(() => reads.length).toBe(2);
  expect(reads[1].at - reads[0].at).toBeLessThan(DASHBOARD_POLL_INTERVAL_MS);
}

function slotColumns(page: Page) {
  return page.getByRole("main").getByRole("region");
}

test.beforeEach(async ({ page }) => {
  await stubSignedInShell(page);
  await stubDropsApi(page);
});

test("shows the active drop's slots as columns, each with its orders", async ({ page }) => {
  await stubServiceApi(page);

  await page.goto("/service");
  await expect(page).toHaveURL(new RegExp(`/service\\?drop_id=${ACTIVE_DROP_ID}$`));
  await expect(page.getByRole("heading", { name: "Friday Night Drop", level: 1 })).toBeVisible();
  await expect(page.getByText(/^1 in progress -- updated/)).toBeVisible();

  const columns = slotColumns(page);
  await expect(columns).toHaveCount(4);
  await expect(columns.nth(0)).toHaveAccessibleName("17:00 1/6");
  await expect(columns.nth(3)).toHaveAccessibleName("18:30 0/4");
  const order = columns.nth(0).getByRole("listitem").filter({ hasText: "Ana Lopez" });
  await expect(order).toContainText("5125550101");
  await expect(order).toContainText("$13.50");
  await expect(order).toContainText("Margherita + Mushrooms -- extra crispy");
  await expect(order.getByText("Not started", { exact: true })).toBeVisible();
  await expect(columns.nth(3).getByText("No orders yet")).toBeVisible();
});

test("the loading skeletons have one card per slot column, in the columns' grid", async ({ page }) => {
  await stubServiceApi(page);
  const drops = await holdReads(page, DROPS_LIST);
  const dashboard = await holdReads(page, DASHBOARD_READ);

  try {
    await page.goto("/service");
    const skeleton = skeletonCards(page);
    await expect(skeleton).toHaveCount(4);
    const whileDropsLoad = await measureBoxes(skeleton);

    drops.release();
    await expect(page.getByRole("heading", { name: "Service", level: 1 })).toBeVisible();
    await expect(skeleton).toHaveCount(4);
    const whileDashboardLoads = await measureBoxes(skeleton);

    dashboard.release();
    await expect(skeleton).toHaveCount(0);
    await expectSameColumns(whileDropsLoad, slotColumns(page));
    await expectSameColumns(whileDashboardLoads, slotColumns(page));
  } finally {
    drops.release();
    dashboard.release();
  }
});

test("advancing an order sends its new status and shows it", async ({ page }) => {
  const writes = await stubServiceApi(page);
  const reads = await logReads(page, DASHBOARD_READ);

  await page.goto("/service");
  const order = slotColumns(page).nth(0).getByRole("listitem").filter({ hasText: "Ana Lopez" });
  await expect(order.getByText("Not started", { exact: true })).toBeVisible();
  expect(reads).toHaveLength(1);
  await order.getByRole("button", { name: "-> Cooking" }).click();

  await expect(toast(page, "Moved to Cooking")).toBeVisible();
  await expect(order.getByText("Cooking", { exact: true })).toBeVisible();
  await expect(order.getByRole("button", { name: "-> Ready - text sent" })).toBeVisible();
  await expect(order.getByRole("button", { name: "-> Ready - waiting" })).toBeVisible();
  expect(writes).toEqual([
    { method: "POST", path: `/service/orders/${FIRST_ORDER_ID}/advance`, body: { target_status: "cooking" } },
  ]);
  // The new status came from the dashboard re-read the advance invalidated.
  await expectReadCausedByAction(reads);
});

test("a failed dashboard load says so and Retry loads it", async ({ page }) => {
  await stubServiceApi(page);
  await failReads(page, DASHBOARD_READ);
  const reads = await logReads(page, DASHBOARD_READ);

  await page.goto("/service");
  await expect(page.getByRole("heading", { name: "Could not load dashboard" })).toBeVisible();
  expect(reads).toHaveLength(1);
  await page.getByRole("button", { name: "Retry" }).click();

  await expect(slotColumns(page)).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Could not load dashboard" })).toHaveCount(0);
  await expectReadCausedByAction(reads);
});

test("a failed drops load says so and Retry reads the drops again and loads the dashboard", async ({ page }) => {
  await stubServiceApi(page);
  await failReads(page, DROPS_LIST);
  const dropsReads = await logReads(page, DROPS_LIST);

  await page.goto("/service");
  await expect(page.getByRole("heading", { name: "Could not load drops" })).toBeVisible();
  expect(dropsReads).toHaveLength(1);
  await page.getByRole("button", { name: "Retry" }).click();

  await expect.poll(() => dropsReads.length).toBe(2);
  await expect(slotColumns(page)).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Could not load drops" })).toHaveCount(0);
});
