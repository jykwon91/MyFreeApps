/**
 * No-backend E2E for the customer pages, signed out: a customer picks a slot,
 * builds two pizzas, places the order, sees the confirmation and tracks it at
 * /order/status/{id}, which this browser then lists at /order/status; a
 * returning customer reorders their usual; no running drop, a failed load and
 * an unknown order each get their own state; and the order-status skeleton
 * has the loaded layout.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { measureBoxes } from "@platform/ui/test-support/layoutShift";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { CARD } from "./constants/layoutSelectors";
import {
  DROP_LOAD_FAILED_HEADING,
  NO_ACTIVE_DROP_HEADING,
  ORDER_PAGE_HEADING,
  ORDER_PLACED_HEADING,
  ORDER_STATUS_HEADING,
} from "./constants/publicCopy";
import { apiPath } from "./fixtures/apiPath";
import { ACTIVE_DROP_ID } from "./fixtures/dropFixtures";
import { orderIdAt, pizzaIdAt, slotIdAt, toppingIdAt } from "./fixtures/fixtureIds";
import { confirmationFromOrder } from "./fixtures/publicFixtures";
import { fillDetails, pizzaLine } from "./fixtures/publicOrderForm";
import { failReads, holdReads } from "./fixtures/routeControls";
import { expectSameColumns, looseSkeletonBars } from "./fixtures/skeletonLayout";
import { stubPublicApi } from "./fixtures/stubPublicApi";

const CURRENT_DROP = apiPath(/^\/public\/drops\/current$/);
const ORDER_READ = apiPath(/^\/public\/orders\/[^/]+$/);
const PLACED_ID = orderIdAt(100);
const RETURNING_PHONE = "5125550101";

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("places an order, sees it confirmed, tracks it and finds it among this browser's orders", async ({ page }) => {
  const api = await stubPublicApi(page);

  await page.goto("/order");
  await expect(page.getByRole("heading", { name: ORDER_PAGE_HEADING })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Friday Night Drop" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^6:30 PM\s*Full$/ })).toBeDisabled();
  const placeOrder = page.getByRole("button", { name: "Place order" });
  await expect(placeOrder).toBeDisabled();

  await page.getByRole("button", { name: /^5:30 PM/ }).click();
  await pizzaLine(page, 0).getByRole("button", { name: "Mushrooms +$1.50" }).click();
  await pizzaLine(page, 0).getByLabel("Modifications (optional)").fill("  well done ");
  await page.getByRole("button", { name: "Add pizza" }).click();
  await pizzaLine(page, 1).getByLabel("Pick a pizza").selectOption({ label: "Pepperoni -- $14.50" });
  await fillDetails(page, " Dana Cruz ", "(512) 555-0199");
  await page.getByRole("button", { name: "Zelle", exact: true }).click();
  await expect(page.getByText("$28.00", { exact: true })).toBeVisible();
  await placeOrder.click();

  await expect(page.getByRole("heading", { name: ORDER_PLACED_HEADING })).toBeVisible();
  await expect(page.getByText("Pickup at 5:30 PM on Saturday, November 14")).toBeVisible();
  await expect(page.getByText(PLACED_ID.slice(0, 8).toUpperCase(), { exact: true })).toBeVisible();
  expect(api.writes).toEqual([
    {
      method: "POST",
      path: "/public/orders",
      body: {
        drop_id: ACTIVE_DROP_ID,
        slot_id: slotIdAt(2),
        customer_name: "Dana Cruz",
        customer_phone: "(512) 555-0199",
        payment_method_tag: "zelle",
        pizzas: [
          { pizza_type_id: pizzaIdAt(1), topping_type_ids: [toppingIdAt(2)], modifications_text: "well done" },
          { pizza_type_id: pizzaIdAt(2), topping_type_ids: [], modifications_text: null },
        ],
      },
    },
  ]);

  await page.getByRole("link", { name: "Track this order" }).click();
  await expect(page).toHaveURL(new RegExp(`/order/status/${PLACED_ID}$`));
  await expect(page.getByRole("heading", { name: ORDER_STATUS_HEADING })).toBeVisible();
  await expect(page.getByText("Not started", { exact: true })).toBeVisible();
  await expect(page.getByText("Zelle (Not yet paid)")).toBeVisible();
  const lines = page.getByRole("main").getByRole("listitem");
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toContainText('Margherita+ Mushrooms"well done"$13.50');
  await expect(lines.nth(1)).toContainText("Pepperoni$14.50");

  await page.goto("/order/status");
  const saved = page.getByRole("link", { name: /Friday Night Drop/ });
  await expect(saved).toContainText(`#${PLACED_ID.slice(0, 8).toUpperCase()} -- Dana Cruz`);
  await saved.click();
  await expect(page).toHaveURL(new RegExp(`/order/status/${PLACED_ID}$`));
});

test("a returning customer is welcomed by name and can reorder their usual", async ({ page }) => {
  const api = await stubPublicApi(page, {
    knownCustomers: {
      [RETURNING_PHONE]: {
        customer_name: "Ana Lopez",
        the_usual: [{ pizza_type_id: pizzaIdAt(2), topping_type_ids: [toppingIdAt(1)], modifications_text: "cut in squares" }],
      },
    },
  });

  await page.goto("/order");
  await page.getByRole("button", { name: /^5:00 PM/ }).click();
  await page.getByLabel("Phone (for pickup ready text)").fill(RETURNING_PHONE);
  await expect(page.getByText("Welcome back, Ana Lopez!")).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Ana Lopez");
  await page.getByRole("button", { name: "Order the usual" }).click();

  await expect(page.getByText("Your usual order has been loaded")).toBeVisible();
  await expect(pizzaLine(page, 0).getByLabel("Pick a pizza")).toHaveValue(pizzaIdAt(2));
  await expect(pizzaLine(page, 0).getByRole("button", { name: "Basil" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Place order" }).click();

  await expect(page.getByRole("heading", { name: ORDER_PLACED_HEADING })).toBeVisible();
  expect(api.lookups).toEqual([RETURNING_PHONE]);
  expect(api.writes).toEqual([
    expect.objectContaining({
      body: expect.objectContaining({
        customer_name: "Ana Lopez",
        customer_phone: RETURNING_PHONE,
        payment_method_tag: "venmo",
        pizzas: [{ pizza_type_id: pizzaIdAt(2), topping_type_ids: [toppingIdAt(1)], modifications_text: "cut in squares" }],
      }),
    }),
  ]);
});

test("with no drop running, the order page says to check back", async ({ page }) => {
  await stubPublicApi(page, { noActiveDrop: true });

  await page.goto("/order");
  await expect(page.getByRole("heading", { name: NO_ACTIVE_DROP_HEADING })).toBeVisible();
  await expect(page.getByRole("button", { name: "Place order" })).toHaveCount(0);
});

test("a failed load of the drop says so and Retry shows the order form", async ({ page }) => {
  await stubPublicApi(page);
  await failReads(page, CURRENT_DROP);

  await page.goto("/order");
  await expect(page.getByRole("heading", { name: DROP_LOAD_FAILED_HEADING })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();

  await expect(page.getByRole("heading", { name: "Friday Night Drop" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Place order" })).toBeVisible();
});

test("an order id this server never issued is reported as not found", async ({ page }) => {
  await stubPublicApi(page);

  await page.goto(`/order/status/${orderIdAt(999)}`);
  await expect(page.getByRole("heading", { name: "Order not found" })).toBeVisible();
});

test("the order status skeleton has one placeholder per loaded card, in their column", async ({ page }) => {
  const order = confirmationFromOrder(PLACED_ID, {
    drop_id: ACTIVE_DROP_ID,
    slot_id: slotIdAt(1),
    customer_name: "Dana Cruz",
    customer_phone: "5125550199",
    payment_method_tag: "cash",
    pizzas: [{ pizza_type_id: pizzaIdAt(1), topping_type_ids: [], modifications_text: null }],
  });
  await stubPublicApi(page, { orders: [order] });
  const gate = await holdReads(page, ORDER_READ);

  try {
    await page.goto(`/order/status/${PLACED_ID}`);
    const bars = looseSkeletonBars(page);
    await expect(bars).toHaveCount(2);
    const boxes = await measureBoxes(bars);

    gate.release();
    await expect(bars).toHaveCount(0);
    await expectSameColumns(boxes, page.getByRole("main").locator(CARD));
    await expect(page.getByRole("heading", { name: ORDER_STATUS_HEADING })).toBeVisible();
  } finally {
    gate.release();
  }
});
