/**
 * WoW Forever "Best gear" → "My lists": player-made lists kept in this
 * browser, shared by a link that carries the list in its fragment.
 *
 * Run: npx playwright test --config e2e/playwright.config.ts wow-forever-gear-lists
 */
import { test, expect, type Page } from "@playwright/test";

const LIST_NAME = "E2E Warlock pre-raid";
const PHONE = { width: 375, height: 812 };

function slotRow(page: Page, slot: string) {
  return page.locator(`[data-testid="bis-slot-row"][data-slot="${slot}"]`);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function openMyLists(page: Page) {
  await page.goto("/wow-forever/gear");
  await page.getByRole("radio", { name: "My lists" }).click();
  await expect(page).toHaveURL(/[?&]view=mine/);
}

async function createWithHood(page: Page) {
  await openMyLists(page);
  const form = page.getByTestId("bis-list-create");
  await form.getByRole("textbox", { name: "List name" }).fill(LIST_NAME);
  await form.getByRole("radio", { name: "Empty" }).click();
  await form.getByRole("button", { name: "Create list" }).click();
  await expect(page.getByRole("heading", { name: LIST_NAME })).toBeVisible();

  const head = slotRow(page, "head");
  await head.getByRole("button", { name: "Pick an item for Head" }).click();
  await head.getByRole("combobox", { name: "Item name" }).fill("felcloth hood");
  await head.getByRole("option", { name: /Felcloth Hood/ }).click();
  await expect(head.getByRole("link", { name: "Felcloth Hood" })).toHaveAttribute("href", "/wow-forever/items/14111");
}

test("create → pick → reload keeps it → copy link → a fresh browser opens it read-only → save it", async ({ page, context, browser }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await createWithHood(page);

  await page.reload();
  await expect(page.getByRole("heading", { name: LIST_NAME })).toBeVisible();
  await expect(slotRow(page, "head").getByRole("link", { name: "Felcloth Hood" })).toBeVisible();

  await page.getByRole("button", { name: /Copy link/ }).click();
  await expect(page.getByText(`Link to “${LIST_NAME}” copied`)).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/wow-forever\/gear\?view=mine#list=1~warlock~affliction~preraid~head:14111~/);

  // A different person: no saved lists, no settings.
  const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const friend = await other.newPage();
  await friend.goto(url);
  const shared = friend.getByTestId("bis-shared-list");
  await expect(shared.getByRole("heading", { name: LIST_NAME })).toBeVisible();
  await expect(shared).toContainText("read-only");
  await expect(slotRow(friend, "head").getByRole("link", { name: "Felcloth Hood" })).toBeVisible();
  await expect(friend.getByRole("button", { name: /Pick an item/ })).toHaveCount(0);

  // "My lists" again and a faction change both keep the shared list open.
  await friend.getByRole("radio", { name: "My lists" }).click();
  await friend.getByRole("radiogroup", { name: "Quest sources for" }).getByRole("radio", { name: "Horde" }).click();
  await expect(friend).toHaveURL(/[?&]faction=H.*#list=1~warlock/);
  await expect(shared.getByRole("heading", { name: LIST_NAME })).toBeVisible();

  await friend.getByRole("button", { name: "Save to my lists" }).click();
  await expect(friend.getByText(`Saved “${LIST_NAME}” to your lists`)).toBeVisible();
  await expect(friend.getByTestId("bis-list-editor").getByRole("heading", { name: LIST_NAME })).toBeVisible();
  await expect(friend).not.toHaveURL(/#list=/);
  await friend.reload();
  await expect(friend.getByTestId("bis-list-editor").getByRole("heading", { name: LIST_NAME })).toBeVisible();
  await other.close();
});

test("a broken share link says so and goes back to my lists", async ({ page }) => {
  await page.goto("/wow-forever/gear#list=1~warlock~affliction");
  await expect(page.getByTestId("bis-shared-invalid")).toContainText("This list link doesn't work");
  await page.getByRole("button", { name: "Back to my lists" }).click();
  await expect(page.getByTestId("bis-list-create")).toBeVisible();
});

test("delete asks first", async ({ page }) => {
  await createWithHood(page);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(`Delete “${LIST_NAME}”?`);
  await dialog.getByRole("button", { name: "Delete list" }).click();
  await expect(page.getByTestId("bis-list-create")).toBeVisible();
});

test("at 375px: no horizontal overflow, 44px touch targets", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize(PHONE);
  await openMyLists(page);
  await expectNoHorizontalOverflow(page);
  await createWithHood(page);
  await expectNoHorizontalOverflow(page);

  const chest = slotRow(page, "chest");
  const pickButton = chest.getByRole("button", { name: "Pick an item for Chest" });
  expect((await pickButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await pickButton.click();
  await chest.getByRole("combobox", { name: "Item name" }).fill("robe");
  await expect(chest.getByRole("option").first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  for (const name of [/Copy link/, "Rename", "Duplicate", "Delete"]) {
    const box = await page.getByRole("button", { name, exact: typeof name === "string" }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const checkbox = slotRow(page, "head").locator("label", { hasText: "I have it" });
  expect((await checkbox.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.getByRole("button", { name: /Copy link/ }).click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  await page.goto(url);
  await expect(page.getByTestId("bis-shared-list")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
