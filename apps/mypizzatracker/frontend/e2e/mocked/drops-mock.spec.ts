/**
 * No-backend E2E for /drops: the list shows every drop with what can be done
 * to it, its skeleton has the list's layout, a failed load offers a retry, and
 * the operator creates a drop, adds a slot and activates it, each sending the
 * right request and showing the result.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { measureBoxes } from "@platform/ui/test-support/layoutShift";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { toast } from "@platform/ui/test-support/toast";
import { CARD } from "./constants/layoutSelectors";
import { PLANNING_DROP_ID, sampleDrops } from "./fixtures/dropFixtures";
import { apiPath } from "@platform/ui/test-support/apiPath";
import { failReads, holdReads } from "@platform/ui/test-support/routeControls";
import { expectSameColumns, skeletonCards } from "./fixtures/skeletonLayout";
import { stubDropsApi } from "./fixtures/stubDropsApi";

const DROPS_LIST = apiPath(/^\/drops$/);

test.beforeEach(async ({ page }) => {
  await stubSignedInShell(page);
});

test("lists every drop, newest first, with its status, window, slots and the actions its status allows", async ({ page }) => {
  await stubDropsApi(page);

  await page.goto("/drops");
  const cards = page.getByRole("main").locator(CARD);
  // Newest date first, like the server lists them.
  await expect(cards.getByRole("heading", { level: 2 })).toHaveText(["Holiday Drop", "Friday Night Drop", "Opening Night"]);

  const active = cards.filter({ has: page.getByRole("heading", { name: "Friday Night Drop" }) });
  await expect(active.getByText("Active", { exact: true })).toBeVisible();
  await expect(active.getByText("17:00 - 20:00")).toBeVisible();
  await expect(active.getByText("4 slots")).toBeVisible();
  await expect(active.getByText("18:30 -- 4 pizzas")).toBeVisible();
  await expect(active.getByRole("button", { name: "Close drop" })).toBeVisible();

  const planning = cards.filter({ has: page.getByRole("heading", { name: "Holiday Drop" }) });
  await expect(planning.getByText("0 slots")).toBeVisible();
  await expect(planning.getByRole("button", { name: "Activate" })).toBeDisabled();

  const closed = cards.filter({ has: page.getByRole("heading", { name: "Opening Night" }) });
  await expect(closed.getByText("Read-only")).toBeVisible();
  await expect(closed.getByRole("button", { name: "Add slot" })).toHaveCount(0);
});

test("the status filter reads only drops with that status", async ({ page }) => {
  const api = await stubDropsApi(page);

  await page.goto("/drops");
  await expect(page.getByRole("main").locator(CARD)).toHaveCount(3);
  await page.getByRole("combobox").selectOption("closed");

  await expect(page.getByRole("heading", { name: "Opening Night" })).toBeVisible();
  await expect(page.getByRole("main").locator(CARD)).toHaveCount(1);
  expect(api.listStatuses).toEqual(["", "closed"]);
});

test("the loading skeleton has one card per drop, in the list's column", async ({ page }) => {
  await stubDropsApi(page);
  const gate = await holdReads(page, DROPS_LIST);

  try {
    await page.goto("/drops");
    const skeleton = skeletonCards(page);
    await expect(skeleton).toHaveCount(sampleDrops().length);
    const boxes = await measureBoxes(skeleton);

    gate.release();
    await expect(skeleton).toHaveCount(0);
    await expectSameColumns(boxes, page.getByRole("main").locator(CARD));
  } finally {
    gate.release();
  }
});

test("a failed load says so and Retry loads the list", async ({ page }) => {
  await stubDropsApi(page);
  await failReads(page, DROPS_LIST);

  await page.goto("/drops");
  await expect(page.getByRole("heading", { name: "Could not load drops" })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();

  await expect(page.getByRole("heading", { name: "Friday Night Drop" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Could not load drops" })).toHaveCount(0);
});

test("creates a drop, adds its first slot and activates it", async ({ page }) => {
  const api = await stubDropsApi(page, sampleDrops().filter((d) => d.id !== PLANNING_DROP_ID));

  await page.goto("/drops");
  await expect(page.getByRole("heading", { name: "Friday Night Drop" })).toBeVisible();
  await page.getByRole("button", { name: "New drop" }).click();
  await page.getByLabel("Name").fill("Pi Day Drop");
  await page.getByLabel("Date").fill("2027-03-14");
  await page.getByLabel("Window start").fill("16:00");
  await page.getByLabel("Window end").fill("19:30");
  await page.getByRole("button", { name: "Create drop" }).click();

  await expect(toast(page, "Drop created")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create drop" })).toHaveCount(0);
  const card = page.getByRole("main").locator(CARD).filter({ has: page.getByRole("heading", { name: "Pi Day Drop" }) });
  await expect(card.getByText("16:00 - 19:30")).toBeVisible();
  await expect(card.getByText("No slots yet.")).toBeVisible();
  await expect(card.getByRole("button", { name: "Activate" })).toBeDisabled();

  await card.getByRole("button", { name: "Add slot" }).click();
  await card.getByLabel("Pickup time").fill("17:15");
  await card.getByLabel("Max pizzas").fill("8");
  await card.getByRole("button", { name: "Add", exact: true }).click();

  await expect(toast(page, "Slot added")).toBeVisible();
  await expect(card.getByText("17:15 -- 8 pizzas")).toBeVisible();
  await card.getByRole("button", { name: "Activate" }).click();

  await expect(toast(page, "Drop active")).toBeVisible();
  await expect(card.getByText("Active", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Close drop" })).toBeVisible();

  const [created, slot, activated] = api.writes;
  expect(created).toEqual({
    method: "POST",
    path: "/drops",
    body: { name: "Pi Day Drop", date: "2027-03-14", slot_window_start: "16:00:00", slot_window_end: "19:30:00" },
  });
  expect(slot).toEqual({ method: "POST", path: expect.stringMatching(/^\/drops\/[^/]+\/slots$/), body: { pickup_time: "17:15:00", max_pizzas: 8 } });
  expect(activated).toEqual({ method: "PATCH", path: slot.path.replace(/\/slots$/, ""), body: { status: "active" } });
  expect(api.writes).toHaveLength(3);
});
