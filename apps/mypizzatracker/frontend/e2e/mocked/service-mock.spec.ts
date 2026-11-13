/**
 * No-backend E2E for /service: the active drop's dashboard loads one column
 * per pickup slot with its orders, a failed load offers a retry, and
 * advancing an order sends the new status and shows it.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { toast } from "@platform/ui/test-support/toast";
import { apiPath } from "./fixtures/apiPath";
import { ACTIVE_DROP_ID } from "./fixtures/dropFixtures";
import { failReads } from "./fixtures/routeControls";
import { FIRST_ORDER_ID } from "./fixtures/serviceFixtures";
import { stubDropsApi } from "./fixtures/stubDropsApi";
import { stubServiceApi } from "./fixtures/stubServiceApi";

const DASHBOARD_READ = apiPath(/^\/service\/drops\/[^/]+$/);

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

test("advancing an order sends its new status and shows it", async ({ page }) => {
  const writes = await stubServiceApi(page);

  await page.goto("/service");
  const order = slotColumns(page).nth(0).getByRole("listitem").filter({ hasText: "Ana Lopez" });
  await order.getByRole("button", { name: "-> Cooking" }).click();

  await expect(toast(page, "Moved to Cooking")).toBeVisible();
  await expect(order.getByText("Cooking", { exact: true })).toBeVisible();
  await expect(order.getByRole("button", { name: "-> Ready - text sent" })).toBeVisible();
  await expect(order.getByRole("button", { name: "-> Ready - waiting" })).toBeVisible();
  expect(writes).toEqual([
    { method: "POST", path: `/service/orders/${FIRST_ORDER_ID}/advance`, body: { target_status: "cooking" } },
  ]);
});

test("a failed dashboard load says so and Retry loads it", async ({ page }) => {
  await stubServiceApi(page);
  await failReads(page, DASHBOARD_READ);

  await page.goto("/service");
  await expect(page.getByRole("heading", { name: "Could not load dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();

  await expect(slotColumns(page)).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Could not load dashboard" })).toHaveCount(0);
});
