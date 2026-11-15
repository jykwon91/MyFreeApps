/**
 * No-backend E2E for lookups that depend on what the user typed: the order
 * page's returning-customer banner follows the phone number, and the customer
 * search never shows the previous search's rows under a failed or loading one.
 */
import { apiPath } from "@platform/ui/test-support/apiPath";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { holdReads } from "@platform/ui/test-support/routeControls";
import { FIXTURE_NOW } from "./constants/fixtureTimes";
import { pizzaIdAt } from "./fixtures/fixtureIds";
import { skeletonCards } from "./fixtures/skeletonLayout";
import { stubCustomersApi } from "./fixtures/stubCustomersApi";
import { stubPublicApi } from "./fixtures/stubPublicApi";
import { stubSignedInShellAt } from "./fixtures/stubSignedInShellAt";

const KNOWN_PHONE = "5125550101";
const UNKNOWN_PHONE = "5125550000";
const CUSTOMERS_READ = apiPath(/^\/customers$/);
const SEARCH_THAT_FAILS = "zzz";

test("the order page stops welcoming the previous phone's customer once the phone changes or is cleared", async ({ page }) => {
  await stubPublicApi(page, {
    knownCustomers: {
      [KNOWN_PHONE]: {
        customer_name: "Ana Lopez",
        the_usual: [{ pizza_type_id: pizzaIdAt(2), topping_type_ids: [], modifications_text: null }],
      },
    },
  });
  const phone = page.getByLabel("Phone (for pickup ready text)");
  const welcome = page.getByText("Welcome back, Ana Lopez!");
  const usual = page.getByRole("button", { name: "Order the usual" });

  await page.goto("/order");
  await phone.fill(KNOWN_PHONE);
  await expect(welcome).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Ana Lopez");

  await phone.fill(UNKNOWN_PHONE);
  await expect(welcome).toHaveCount(0);
  await expect(usual).toHaveCount(0);
  await expect(page.getByLabel("Name")).toHaveValue("");

  await phone.fill(KNOWN_PHONE);
  await expect(welcome).toBeVisible();
  await phone.fill("");
  await expect(welcome).toHaveCount(0);
  await expect(usual).toHaveCount(0);
});

test("after ordering the usual, the order page keeps saying so for that phone and drops it for another", async ({ page }) => {
  await stubPublicApi(page, {
    knownCustomers: {
      [KNOWN_PHONE]: {
        customer_name: "Ana Lopez",
        the_usual: [{ pizza_type_id: pizzaIdAt(2), topping_type_ids: [], modifications_text: null }],
      },
    },
  });
  const phone = page.getByLabel("Phone (for pickup ready text)");

  await page.goto("/order");
  await phone.fill(KNOWN_PHONE);
  await page.getByRole("button", { name: "Order the usual" }).click();
  await expect(page.getByText("Your usual order has been loaded")).toBeVisible();

  await phone.fill(UNKNOWN_PHONE);
  await expect(page.getByText("Welcome back, Ana Lopez!")).toHaveCount(0);
  await expect(page.getByText("Your usual order has been loaded")).toHaveCount(0);
});

test.describe("customer search", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXTURE_NOW);
    await stubSignedInShellAt(page, FIXTURE_NOW);
  });

  test("a failed search shows the error and none of the previous search's customers", async ({ page }) => {
    await stubCustomersApi(page);
    await page.route(CUSTOMERS_READ, (route) =>
      new URL(route.request().url()).searchParams.get("search") === SEARCH_THAT_FAILS
        ? route.fulfill({ status: 500, body: "Internal Server Error" })
        : route.fallback(),
    );
    const cards = page.getByRole("main").getByRole("listitem");

    await page.goto("/customers");
    await expect(cards).toHaveCount(3);
    await page.getByPlaceholder("Search by name or phone...").fill(SEARCH_THAT_FAILS);

    await expect(page.getByRole("heading", { name: "Could not load customers" })).toBeVisible();
    await expect(cards).toHaveCount(0);
  });

  test("while a new search loads, the previous search's customers give way to the skeleton", async ({ page }) => {
    await stubCustomersApi(page);
    const cards = page.getByRole("main").getByRole("listitem");

    await page.goto("/customers");
    await expect(cards).toHaveCount(3);
    const gate = await holdReads(page, CUSTOMERS_READ);
    try {
      await page.getByPlaceholder("Search by name or phone...").fill("ben");
      await expect(page.getByRole("main").getByRole("heading", { name: "Ana Lopez" })).toHaveCount(0);
      await expect(skeletonCards(page)).toHaveCount(3);
    } finally {
      gate.release();
    }
    await expect(cards.getByRole("heading")).toHaveText(["Ben Ortiz"]);
  });
});
