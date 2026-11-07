/**
 * WoW Forever World Map — your own marks, route and "Share this view":
 * right-click → add → kept after a reload → rename → delete (with Undo);
 * a long press on a touch screen adds one; a 3-mark route draws its line and
 * yards; a shared link opens read-only in a fresh browser and "Save to my
 * marks" makes them yours; a garbage link shows a notice, never a crash; and
 * nothing scrolls sideways at 375 px.
 *
 * Frontend-only (static data + map art, marks in localStorage), so nothing
 * is seeded; the capture API is answered empty.
 *
 * Run: npx playwright test --config e2e/playwright.config.ts wow-world-map-marks
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { hideMapLayers } from "./fixtures/mapLayers";

const MARKS_KEY = "mga.wowForever.worldMap.marks.v1";
const ELWYNN = 1429;
const PHONE = { width: 375, height: 812 };

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

async function prepare(page: Page) {
  await page.route("**/api/wow/map-captures", (route) => route.fulfill({ json: { captures: [] } }));
  // The clicks are on the map's ground, not on layer markers standing there.
  await hideMapLayers(page);
}

async function openElwynn(page: Page) {
  await page.goto(`/wow-forever/map?m=${ELWYNN}`);
  await expect(page.getByRole("img", { name: "Elwynn Forest map" })).toBeVisible();
}

async function mapPoint(page: Page, x: number, y: number) {
  const box = await page.getByTestId("zone-map").boundingBox();
  if (!box) throw new Error("the map isn't on screen");
  return { x: (box.width * x) / 100, y: (box.height * y) / 100 };
}

async function storedLabels(page: Page): Promise<string[]> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), MARKS_KEY);
  const store = JSON.parse(raw ?? "{}") as { maps?: Record<string, { marks: { label: string }[] }> };
  return (store.maps?.[ELWYNN]?.marks ?? []).map((m) => m.label);
}

/** Right-click at (x, y) → "Add a mark here" → type its name. */
async function addMark(page: Page, x: number, y: number, name: string) {
  await page.getByTestId("zone-map").click({ button: "right", position: await mapPoint(page, x, y) });
  await page.getByRole("menu").getByRole("menuitem", { name: "Add a mark here" }).click();
  // The new mark's name box has focus, its default name selected.
  const box = page.getByRole("textbox", { name: "Mark name" }).last();
  await expect(box).toBeFocused();
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("img", { name: `Your mark ${name}` })).toBeAttached();
}

test("right-click adds a mark that survives a reload, then renames and deletes it", async ({ page }) => {
  await prepare(page);
  await openElwynn(page);
  const map = page.getByTestId("zone-map");

  await map.click({ button: "right", position: await mapPoint(page, 30, 40) });
  const menu = page.getByRole("menu");
  await expect(menu).toContainText(/At \d+\.\d, \d+\.\d/);
  await expect(menu.getByRole("menuitem", { name: "Add a mark here" })).toBeFocused();
  // Right-click no longer zooms out by itself: the menu offers it.
  await expect(menu.getByRole("menuitem", { name: "Zoom out to Eastern Kingdoms" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Elwynn Forest map" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Add a mark here" }).click();

  await expect(page.getByRole("button", { name: /^My marks \(1\)/ })).toHaveAttribute("aria-expanded", "true");
  const nameBox = page.getByRole("textbox", { name: "Mark name" });
  await expect(nameBox).toBeFocused();
  await expect(nameBox).toHaveValue("Mark");
  await expect(page.getByRole("img", { name: "Your mark Mark" })).toBeAttached();

  await page.reload();
  await expect(page.getByRole("img", { name: "Your mark Mark" })).toBeAttached();
  await page.getByRole("button", { name: /^My marks \(1\)/ }).click();

  await nameBox.fill("Hogger camp");
  await nameBox.press("Enter");
  await expect(page.getByRole("img", { name: "Your mark Hogger camp" })).toBeAttached();
  expect(await storedLabels(page)).toEqual(["Hogger camp"]);

  // Delete has Undo instead of a confirm dialog.
  await page.getByRole("button", { name: "Delete Hogger camp" }).click();
  await expect(page.getByRole("button", { name: /^My marks \(0\)/ })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Deleted “Hogger camp”" })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("img", { name: "Your mark Hogger camp" })).toBeAttached();
  await page.getByRole("button", { name: "Delete Hogger camp" }).click();
  await expect(page.getByRole("img", { name: /^Your mark / })).toHaveCount(0);
  expect(await storedLabels(page)).toEqual([]);

  // The keyboard way in: Shift+F10 on the focused map; Esc closes and focus goes back to the map.
  await map.focus();
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(map).toBeFocused();
  await expect(page.getByRole("img", { name: "Elwynn Forest map" })).toBeVisible();
});

test("a three-mark route draws its line and straight-line yards", async ({ page }) => {
  await prepare(page);
  await openElwynn(page);
  await addMark(page, 30, 40, "Alpha");
  await addMark(page, 50, 50, "Bravo");
  await addMark(page, 60, 70, "Charlie");

  for (const name of ["Alpha", "Bravo", "Charlie"]) await page.getByRole("button", { name: `Add ${name} to the route` }).click();

  await expect(page.getByTestId("my-route-line")).toBeAttached();
  await expect(page.getByTestId("my-route-total")).toHaveText(/^~[\d,]+ yd straight-line$/);
  const route = page.getByTestId("my-route");
  await expect(route.getByRole("listitem")).toHaveText([/Alpha/, /Bravo.*from stop 1/, /Charlie.*from stop 2/]);
  await expect(page.getByRole("img", { name: "Your mark Charlie, route stop 3" })).toBeAttached();

  await page.getByRole("button", { name: "Move stop 3 up" }).click();
  await expect(route.getByRole("listitem")).toHaveText([/Alpha/, /Charlie/, /Bravo/]);
});

async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  await prepare(page);
  return page;
}

test("a shared view opens read-only elsewhere, and saving makes the marks yours", async ({ page, browser }) => {
  await prepare(page);
  await openElwynn(page);
  await addMark(page, 30, 40, "Alpha");
  await addMark(page, 50, 50, "Bravo <b>bold</b>");
  await addMark(page, 60, 70, "Charlie");
  for (const name of ["Alpha", "Charlie"]) await page.getByRole("button", { name: `Add ${name} to the route` }).click();

  await page.getByRole("button", { name: "Share this view" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/wow-forever\/map\?m=1429#view=1~1429~/);

  const friend = await freshPage(browser);
  await friend.goto(url);
  await expect(friend.getByRole("img", { name: "Elwynn Forest map" })).toBeVisible();
  const banner = friend.getByRole("region", { name: "Shared with you" });
  await expect(banner).toContainText("Shared with you: 3 marks on Elwynn Forest and a 2-stop route");
  // Labels are text, never markup.
  await expect(banner.getByText("Bravo <b>bold</b>")).toBeVisible();
  await expect(friend.locator("b", { hasText: "bold" })).toHaveCount(0);
  await expect(friend.getByTestId("shared-marks-layer").getByRole("img")).toHaveCount(3);
  await expect(friend.getByTestId("shared-route-line")).toBeAttached();
  await expect(friend.getByRole("button", { name: /^My marks \(0\)/ })).toBeVisible();
  // The link left the address bar once it was read.
  await expect(friend).not.toHaveURL(/#view=/);

  await banner.getByRole("button", { name: "Save to my marks" }).click();
  // The marks are saved; the link's layers stay a separate choice.
  await expect(banner.getByRole("button", { name: "Save to my marks" })).toHaveCount(0);
  await expect(friend.getByTestId("shared-marks-layer")).toHaveCount(0);
  await banner.getByRole("button", { name: "Use my layers" }).click();
  await expect(banner).toHaveCount(0);
  await expect(friend.getByRole("button", { name: /^My marks \(3\)/ })).toHaveAttribute("aria-expanded", "true");
  await expect(friend.getByRole("img", { name: "Your mark Alpha, route stop 1" })).toBeAttached();
  await expect(friend.getByRole("img", { name: "Your mark Charlie, route stop 2" })).toBeAttached();
  expect(await storedLabels(friend)).toEqual(["Alpha", "Bravo <b>bold</b>", "Charlie"]);

  // Opening the same link again and saving never doubles them up.
  await friend.goto(url);
  await friend.getByRole("region", { name: "Shared with you" }).getByRole("button", { name: "Save to my marks" }).click();
  expect(await storedLabels(friend)).toEqual(["Alpha", "Bravo <b>bold</b>", "Charlie"]);
  await friend.context().close();
});

test("a garbage share link shows a friendly notice, not a crash", async ({ page }) => {
  await prepare(page);
  await page.goto(`/wow-forever/map?m=${ELWYNN}#view=1~not~a~real~link~%E0%A4`);
  await expect(page.getByText(/That shared map link doesn't work/)).toBeVisible();
  await expect(page.getByRole("img", { name: "Elwynn Forest map" })).toBeVisible();
  await expect(page).not.toHaveURL(/#view=/);
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText(/That shared map link doesn't work/)).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test("a long press adds a mark, and nothing scrolls sideways", async ({ page }) => {
    await prepare(page);
    await openElwynn(page);
    await page.getByTestId("zone-map").scrollIntoViewIfNeeded();
    const box = await page.getByTestId("zone-map").boundingBox();
    if (!box) throw new Error("the map isn't on screen");
    const at = { x: Math.round(box.x + box.width * 0.4), y: Math.round(box.y + box.height * 0.5) };

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
    await expect(page.getByTestId("long-press-ring")).toBeAttached();
    await page.waitForTimeout(700);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // A bottom sheet with big touch targets.
    const item = menu.getByRole("menuitem", { name: "Add a mark here" });
    expect((await item.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await item.tap();
    await expect(page.getByRole("img", { name: "Your mark Mark" })).toBeAttached();
    await expect(page.getByRole("button", { name: /^My marks \(1\)/ })).toBeVisible();

    // A quick tap is still a tap, never the menu.
    await page.touchscreen.tap(at.x, at.y + 20);
    await expect(menu).toHaveCount(0);

    await page.getByRole("button", { name: "Add Mark to the route" }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
