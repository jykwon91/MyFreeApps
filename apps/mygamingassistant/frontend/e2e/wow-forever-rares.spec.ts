/**
 * WoW Forever rares finder — the list, its filters (kept in the URL), the
 * /target line and macro copy, the seen / killed checklist across a reload,
 * the "Show on map" deep link, the World Map's Rares layer, the phone layout
 * and the loading skeleton.
 *
 * Run: npx playwright test --config e2e/playwright.config.ts wow-forever-rares
 */
import { test, expect, type Page } from "@playwright/test";

const RARES = "/wow-forever/rares";
const PLAYER_KEY = "mga.wowForever.worldMap.player.v1";
const CHECKLIST_KEY = "mga.wowForever.rares.checklist.v1";
const ELWYNN = 1429;
const REDRIDGE = 1433;

function setPlayerLevel(page: Page, level: number | null) {
  return page.addInitScript(
    ([key, value]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
    },
    [PLAYER_KEY, JSON.stringify({ faction: "A", classId: "warlock", zoneId: null, level, position: null })] as const,
  );
}

/** The clipboard's text; the OS clipboard may turn line breaks into CRLF (Windows). */
async function clipboardText(page: Page): Promise<string> {
  return (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
}

async function noSideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/wow/map-captures", (route) => route.fulfill({ json: { captures: [] } }));
});

test("the list shows every rare lowest level first, with level, place, drops and a /target line", async ({ page }) => {
  await page.goto(RARES);
  await expect(page.getByRole("heading", { level: 1, name: "Rares" })).toBeVisible();
  await expect(page).toHaveTitle(/Rares/);
  const rows = page.getByTestId("rare-row");
  await expect(rows).toHaveCount(13);
  await expect(page.getByTestId("rares-count")).toHaveText("13 rares · 0 seen / killed");

  const morgaine = rows.first();
  await expect(morgaine).toContainText("Morgaine the Sly");
  await expect(morgaine.getByTestId("rare-level")).toContainText("Level 10");
  await expect(morgaine.getByTestId("rare-where")).toContainText("Elwynn Forest");
  await expect(morgaine.getByTestId("rare-target-line")).toHaveText("/target Morgaine the Sly");
  await expect(morgaine.getByTestId("rare-drops")).toContainText("Lithe Boots");
  // Classification from the game files, the rest Classic data.
  await expect(morgaine.getByTestId("provenance-badge").first()).toBeVisible();

  // Rares new in Forever come last and say so, with no map link.
  const kackle = rows.filter({ hasText: "Kackle" });
  await expect(kackle).toContainText("New in Forever");
  await expect(kackle.getByTestId("rare-map-link")).toHaveCount(0);

  await expect(page.locator('a[href*="wowhead"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Rares" }).first()).toBeVisible();
});

test("filters narrow the list, live in the URL and reset", async ({ page }) => {
  await setPlayerLevel(page, null);
  await page.goto(RARES);
  const rows = page.getByTestId("rare-row");
  await expect(rows).toHaveCount(13);

  await page.getByLabel("Zone").selectOption(String(REDRIDGE));
  await expect(page).toHaveURL(new RegExp(`zone=${REDRIDGE}`));
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: "Morgaine" })).toHaveCount(0);

  await page.getByLabel("Lowest level").fill("25");
  await expect(page).toHaveURL(/min=25/);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Kazon");

  // A shared link opens with the same filters.
  await page.reload();
  await expect(page.getByLabel("Zone")).toHaveValue(String(REDRIDGE));
  await expect(rows).toHaveCount(1);

  await page.getByLabel("Highest level").fill("20");
  await expect(rows).toHaveCount(0);
  await expect(page.getByTestId("rares-empty")).toBeVisible();
  await page.getByTestId("rares-empty").getByRole("button", { name: "Reset filters" }).click();
  await expect(page).toHaveURL(RARES);
  await expect(rows).toHaveCount(13);
});

test("fits my level uses the World Map's saved level, and setting it here saves it there", async ({ page }) => {
  await setPlayerLevel(page, null);
  await page.goto(`${RARES}?fit=1`);
  await expect(page.getByTestId("rare-fit-no-level")).toBeVisible();
  await expect(page.getByTestId("rare-row")).toHaveCount(13);

  await page.getByLabel("Your level").fill("11");
  await expect(page.getByTestId("rare-row")).toHaveCount(1);
  await expect(page.getByTestId("rare-row").first()).toContainText("Morgaine the Sly");
  const saved = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").level, PLAYER_KEY);
  expect(saved).toBe(11);
});

test("copy buttons copy the /target line and the filtered macro, with its character count", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${RARES}?zone=${REDRIDGE}`);
  const kazon = page.getByTestId("rare-row").filter({ hasText: "Kazon" });
  await kazon.getByRole("button", { name: "Copy" }).click();
  expect(await clipboardText(page)).toBe("/target Kazon");

  const macros = page.getByTestId("rare-macros");
  await macros.locator("summary").click();
  const macro = macros.getByTestId("rare-macro");
  await expect(macro).toHaveCount(1);
  const copied = macro.locator("pre");
  const text = (await copied.textContent()) ?? "";
  expect(text.split("\n").every((line) => line.startsWith("/target "))).toBe(true);
  await expect(macro.getByTestId("rare-macro-count")).toHaveText(`${text.length} / 255 characters`);
  await macro.getByRole("button", { name: "Copy macro" }).click();
  expect(await clipboardText(page)).toBe(text);
});

test("the seen / killed checklist survives a reload and clears", async ({ page }) => {
  await page.goto(RARES);
  const box = page.getByRole("checkbox", { name: "Seen / killed: Morgaine the Sly" });
  await box.check();
  await expect(page.getByTestId("rares-count")).toContainText("1 seen / killed");
  expect(await page.evaluate((key) => window.localStorage.getItem(key), CHECKLIST_KEY)).toContain("99");

  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Seen / killed: Morgaine the Sly" })).toBeChecked();
  await page.getByRole("button", { name: "Clear seen / killed" }).click();
  await expect(page.getByRole("checkbox", { name: "Seen / killed: Morgaine the Sly" })).not.toBeChecked();
  await expect(page.getByTestId("rares-count")).toContainText("0 seen / killed");
});

test("Show on map opens the zone with the rare's spots marked and the Rares layer previewed", async ({ page }) => {
  await page.goto(RARES);
  const link = page.getByTestId("rare-row").filter({ hasText: "Morgaine the Sly" }).getByTestId("rare-map-link");
  await expect(link).toHaveAttribute("href", new RegExp(`^/wow-forever/map\\?m=${ELWYNN}#view=1~`));
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/wow-forever/map\\?m=${ELWYNN}`));
  await expect(page.getByRole("img", { name: "Elwynn Forest map" })).toBeVisible();
  await expect(page.getByTestId("shared-view-banner")).toBeVisible();

  // Picking the rare's pin shows its card with drops under the map.
  const pin = page.getByRole("group", { name: "Elwynn Forest markers" }).getByRole("button", { name: "Morgaine the Sly — level 10 rare" });
  await pin.click();
  const card = page.getByTestId("rare-map-card");
  await expect(card).toContainText("Morgaine the Sly");
  await expect(card.getByTestId("rare-drops")).toContainText("Lithe Boots");
  await expect(card.getByTestId("rare-target-line")).toHaveText("/target Morgaine the Sly");
});

test("the World Map's Rares layer is counted and toggles the pins", async ({ page }) => {
  await page.goto(`/wow-forever/map?m=${REDRIDGE}`);
  await expect(page.getByRole("img", { name: "Redridge Mountains map" })).toBeVisible();
  await page.getByRole("button", { name: /^Layers \(\d+\)/ }).click();
  const panel = page.getByRole("region", { name: "Map layers" });
  const toggle = panel.getByRole("checkbox", { name: /^Rares \(\d+\)/ });
  await expect(toggle).not.toBeChecked();
  const name = (await toggle.evaluate((el) => (el as HTMLInputElement).labels?.[0]?.textContent ?? "")) ?? "";
  expect(Number(name.match(/\((\d+)\)/)?.[1])).toBeGreaterThan(0);

  const pins = page.getByRole("group", { name: "Redridge Mountains markers" }).getByRole("button", { name: /— level \d+ rare/ });
  await expect(pins).toHaveCount(0);
  await toggle.check();
  await expect.poll(() => pins.count()).toBeGreaterThan(0);
  await toggle.uncheck();
  await expect(pins).toHaveCount(0);
});

test.describe("at 375px", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("the list fits a phone with 44px controls and no sideways scroll", async ({ page }) => {
    await page.goto(RARES);
    await expect(page.getByTestId("rare-row")).toHaveCount(13);
    expect(await noSideways(page)).toBeLessThanOrEqual(0);
    const box = await page.getByTestId("rare-row").first().getByRole("link", { name: "Show on map" }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    const zone = await page.getByLabel("Zone").boundingBox();
    expect(zone?.height).toBeGreaterThanOrEqual(44);
  });
});

test("the skeleton mirrors the list while the rares load, then the list replaces it", async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/data\/rares\/.*\.json/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(RARES);
  const skeleton = page.getByTestId("rares-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute("aria-busy", "true");
  await expect(skeleton.getByTestId("rares-skeleton-filters")).toHaveCount(1);
  await expect(skeleton.getByTestId("rares-skeleton-card")).toHaveCount(4);
  release();
  await expect(skeleton).toHaveCount(0);
  await expect(page.getByTestId("rare-filters")).toHaveCount(1);
  await expect(page.getByTestId("rare-row").first()).toBeVisible();
});
