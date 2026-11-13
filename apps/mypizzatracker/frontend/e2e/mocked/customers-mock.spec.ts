/**
 * No-backend E2E for /customers: every customer loads with their phone,
 * order count and notes, the skeleton has the list's layout, a failed load
 * offers a retry, a search reads only matching customers, and editing notes
 * saves them and shows them.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { measureBoxes } from "@platform/ui/test-support/layoutShift";
import { toast } from "@platform/ui/test-support/toast";
import { FIXTURE_NOW } from "./constants/fixtureTimes";
import { CARD } from "./constants/layoutSelectors";
import { apiPath } from "@platform/ui/test-support/apiPath";
import { customerIdAt } from "./fixtures/fixtureIds";
import { failReads, holdReads } from "@platform/ui/test-support/routeControls";
import { expectSameColumns, skeletonCards } from "./fixtures/skeletonLayout";
import { stubCustomersApi } from "./fixtures/stubCustomersApi";
import { stubSignedInShellAt } from "./fixtures/stubSignedInShellAt";

const CUSTOMERS_READ = apiPath(/^\/customers$/);

function customerCard(page: Page, name: string) {
  return page.getByRole("main").getByRole("listitem").filter({ has: page.getByRole("heading", { name }) });
}

test.beforeEach(async ({ page }) => {
  // "Last:" is relative to today, so pin today to the fixtures' instant.
  await page.clock.setFixedTime(FIXTURE_NOW);
  await stubSignedInShellAt(page, FIXTURE_NOW);
});

test("lists customers by most recent order, with their phone, orders, last order and notes", async ({ page }) => {
  await stubCustomersApi(page);

  await page.goto("/customers");
  const cards = page.getByRole("main").getByRole("listitem");
  await expect(cards.getByRole("heading")).toHaveText(["Ana Lopez", "Cleo Park", "Ben Ortiz"]);

  const ana = customerCard(page, "Ana Lopez");
  await expect(ana).toContainText("(512) 555-0101");
  await expect(ana).toContainText("4 orders");
  await expect(ana).toContainText("Last: yesterday");
  await expect(ana).toContainText("Prefers extra crispy");
  await expect(customerCard(page, "Cleo Park")).toContainText("2 orders");
  await expect(customerCard(page, "Cleo Park")).toContainText("Last: 2w ago");
  const ben = customerCard(page, "Ben Ortiz");
  await expect(ben).toContainText("0 orders");
  await expect(ben).toContainText("Last: never");
  await expect(ben.getByText("No notes yet")).toBeVisible();
});

test("the loading skeleton has one card per customer, in the list's column", async ({ page }) => {
  await stubCustomersApi(page);
  const gate = await holdReads(page, CUSTOMERS_READ);

  try {
    await page.goto("/customers");
    const skeleton = skeletonCards(page);
    await expect(skeleton).toHaveCount(3);
    const boxes = await measureBoxes(skeleton);

    gate.release();
    await expect(skeleton).toHaveCount(0);
    await expectSameColumns(boxes, page.getByRole("main").getByRole("listitem").locator(CARD));
  } finally {
    gate.release();
  }
});

test("a failed load says so and Retry loads the customers", async ({ page }) => {
  await stubCustomersApi(page);
  await failReads(page, CUSTOMERS_READ);

  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Could not load customers" })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();

  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Could not load customers" })).toHaveCount(0);
});

test("a search reads only the customers whose name or phone matches", async ({ page }) => {
  const api = await stubCustomersApi(page);
  const search = page.getByPlaceholder("Search by name or phone...");
  const cards = page.getByRole("main").getByRole("listitem");

  await page.goto("/customers");
  await expect(cards).toHaveCount(3);
  await search.fill("  ben ");
  await expect(cards.getByRole("heading")).toHaveText(["Ben Ortiz"]);

  await search.fill("555-0103");
  await expect(cards.getByRole("heading")).toHaveText(["Cleo Park"]);

  await search.fill("zzz");
  await expect(page.getByRole("heading", { name: 'No customers match "zzz"' })).toBeVisible();
  expect(api.searches).toEqual(["", "ben", "555-0103", "zzz"]);
});

test("saves a customer's notes and shows them", async ({ page }) => {
  const api = await stubCustomersApi(page);

  await page.goto("/customers");
  const ben = customerCard(page, "Ben Ortiz");
  await ben.getByRole("button", { name: "Edit notes for Ben Ortiz" }).click();
  await ben.getByRole("textbox").fill("Allergic to mushrooms");
  await ben.getByRole("button", { name: "Save" }).click();

  await expect(toast(page, "Notes saved")).toBeVisible();
  await expect(ben.getByText("Allergic to mushrooms")).toBeVisible();
  await expect(ben.getByRole("textbox")).toHaveCount(0);
  expect(api.writes).toEqual([
    { method: "PATCH", path: `/customers/${customerIdAt(2)}/notes`, body: { notes: "Allergic to mushrooms" } },
  ]);
});
