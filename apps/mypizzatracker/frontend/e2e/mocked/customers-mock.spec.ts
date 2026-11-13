/**
 * No-backend E2E for /customers: every customer loads with their phone,
 * order count and notes, the skeleton has the list's layout, a failed load
 * offers a retry, a search reads only matching customers, and editing notes
 * saves them and shows them.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { measureBoxes } from "@platform/ui/test-support/layoutShift";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { toast } from "@platform/ui/test-support/toast";
import { CARD } from "./constants/layoutSelectors";
import { apiPath } from "./fixtures/apiPath";
import { customerIdAt } from "./fixtures/fixtureIds";
import { failReads, holdReads } from "./fixtures/routeControls";
import { expectSameColumns, skeletonCards } from "./fixtures/skeletonLayout";
import { stubCustomersApi } from "./fixtures/stubCustomersApi";

const CUSTOMERS_READ = apiPath(/^\/customers$/);

test.beforeEach(async ({ page }) => {
  await stubSignedInShell(page);
});

test("lists every customer with their phone, orders and notes", async ({ page }) => {
  await stubCustomersApi(page);

  await page.goto("/customers");
  const cards = page.getByRole("main").getByRole("listitem");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0).getByRole("heading", { name: "Ana Lopez" })).toBeVisible();
  await expect(cards.nth(0)).toContainText("(512) 555-0101");
  await expect(cards.nth(0)).toContainText("4 orders");
  await expect(cards.nth(0)).toContainText("Last: never");
  await expect(cards.nth(0)).toContainText("Prefers extra crispy");
  await expect(cards.nth(1)).toContainText("1 order");
  await expect(cards.nth(1).getByText("No notes yet")).toBeVisible();
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

test("a search reads only the customers that match", async ({ page }) => {
  const api = await stubCustomersApi(page);

  await page.goto("/customers");
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(3);
  await page.getByPlaceholder("Search by name or phone...").fill("  ben ");

  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Ben Ortiz" })).toBeVisible();
  expect(api.searches).toEqual(["", "ben"]);

  await page.getByPlaceholder("Search by name or phone...").fill("zzz");
  await expect(page.getByRole("heading", { name: 'No customers match "zzz"' })).toBeVisible();
});

test("saves a customer's notes and shows them", async ({ page }) => {
  const api = await stubCustomersApi(page);

  await page.goto("/customers");
  const ben = page.getByRole("main").getByRole("listitem").nth(1);
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
