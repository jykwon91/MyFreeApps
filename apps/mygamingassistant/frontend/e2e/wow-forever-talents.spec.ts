/**
 * WoW Forever talent calculator — picking a class, spending and taking back
 * points, row and prerequisite gating, the level cap, keyboard use, the share
 * link round trip, a broken link, the phone layout and the loading skeleton.
 *
 * Run: npx playwright test --config e2e/playwright.config.ts wow-forever-talents
 */
import { test, expect, type Page } from "@playwright/test";

const MAGE = "/wow-forever/talents/mage";
// Mage Arcane talent ids (Forever client Talent.ID).
const ARCANE_SUBTLETY = 74;
const ARCANE_FOCUS = 76;
const WAND_SPECIALIZATION = 78;
const ARCANE_RESILIENCE = 85;
const ARCANE_MIND = 77;
const PRESENCE_OF_MIND = 86;
// Arcane: Subtlety 2, Focus 5, Channeling 3, Concentration 5, Impact 3, Resilience 1, Shielding 1 = 20 points.
const TWENTY_IN_ARCANE = "1-2530050311--";

function cell(page: Page, talentId: number) {
  return page.locator(`[data-testid="talent-cell"][data-talent-id="${talentId}"]`);
}

async function noSideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("pick a class, spend points, open the next row and take a point back", async ({ page }) => {
  await page.goto("/wow-forever/talents");
  await expect(page.getByRole("heading", { level: 1, name: "Talent calculator" })).toBeVisible();
  await expect(page.getByText("Pick a class to start.")).toBeVisible();
  await page.getByTestId("talent-class-picker").getByRole("link", { name: "Mage" }).click();
  await expect(page).toHaveURL(MAGE);
  await expect(page.getByRole("heading", { level: 1, name: "Mage talents" })).toBeVisible();
  await expect(page).toHaveTitle(/Mage talents/);
  await expect(page.getByTestId("talent-tree")).toHaveCount(3);

  await expect(cell(page, WAND_SPECIALIZATION)).toHaveAttribute("data-state", "locked");
  await cell(page, ARCANE_FOCUS).click();
  // Rank 1 is in the Forever client and changed from Classic (hit vs resist); the details say both.
  const details = page.getByTestId("talent-details");
  await expect(details.getByTestId("talent-details-rank")).toHaveText("rank 1/5");
  await expect(details.getByTestId("talent-rank-line").first()).toContainText("chance to hit with Arcane spells by 2%");
  await expect(details.getByTestId("talent-classic-text")).toContainText("Changed in Forever");
  await expect(details.getByTestId("talent-classic-text").getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "classic");
  for (let i = 0; i < 4; i += 1) await cell(page, ARCANE_FOCUS).click();
  await expect(cell(page, ARCANE_FOCUS)).toHaveAttribute("data-rank", "5");
  await expect(cell(page, ARCANE_FOCUS)).toHaveAttribute("data-state", "maxed");
  // A sixth click does nothing.
  await cell(page, ARCANE_FOCUS).click();
  await expect(cell(page, ARCANE_FOCUS)).toHaveAttribute("data-rank", "5");
  await expect(page).toHaveURL(/[?&]b=1-05--(&|$)/);
  await expect(page.getByTestId("talent-points-spent")).toHaveText("5 of 51");
  await expect(page.getByTestId("talent-split")).toHaveText("5 / 0 / 0");

  // Row 2 is open now.
  await expect(cell(page, WAND_SPECIALIZATION)).toHaveAttribute("data-state", "open");
  await cell(page, WAND_SPECIALIZATION).click();
  await expect(cell(page, WAND_SPECIALIZATION)).toHaveAttribute("data-rank", "1");

  // Right-click takes a point out — but not one row 2 needs.
  await cell(page, ARCANE_FOCUS).click({ button: "right" });
  await expect(cell(page, ARCANE_FOCUS)).toHaveAttribute("data-rank", "5");
  await cell(page, WAND_SPECIALIZATION).click({ button: "right" });
  await expect(cell(page, WAND_SPECIALIZATION)).toHaveAttribute("data-rank", "0");
  await cell(page, ARCANE_FOCUS).click({ button: "right" });
  await expect(cell(page, ARCANE_FOCUS)).toHaveAttribute("data-rank", "4");

  // Ranks the client doesn't have yet say so; − / + work without right-click.
  await expect(details.getByRole("heading", { name: /Arcane Focus/ })).toBeVisible();
  await expect(details.getByTestId("talent-details-rank")).toHaveText("rank 4/5");
  await expect(details.getByTestId("talent-rank-line").first()).toContainText("This rank isn't in the game files yet.");
  await details.getByRole("button", { name: "Add a point to Arcane Focus" }).click();
  await expect(cell(page, ARCANE_FOCUS)).toHaveAttribute("data-rank", "5");

  // Reset clears the build and the link.
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByTestId("talent-points-spent")).toHaveText("0 of 51");
  await expect(page).toHaveURL(MAGE);
});

test("a prerequisite and the rows above gate a talent; a dependent blocks removal", async ({ page }) => {
  await page.goto(`${MAGE}?b=${TWENTY_IN_ARCANE}`);
  await expect(page.getByTestId("talent-points-spent")).toHaveText("20 of 51");
  // Arcane Mind needs Arcane Resilience (met) and 20 points above row 5 (met).
  await expect(cell(page, ARCANE_MIND)).toHaveAttribute("data-state", "open");
  await expect(page.locator('[data-testid="talent-arrows"] g[data-met="true"]')).toHaveCount(1);
  await cell(page, ARCANE_MIND).click();
  await expect(cell(page, ARCANE_MIND)).toHaveAttribute("data-rank", "1");

  // Arcane Resilience can't come out while Arcane Mind depends on it.
  await cell(page, ARCANE_RESILIENCE).click({ button: "right" });
  await expect(cell(page, ARCANE_RESILIENCE)).toHaveAttribute("data-rank", "1");
  await expect(page.getByTestId("talent-details")).toContainText("Arcane Mind needs these points");

  // Presence of Mind's row is open, but a talent after it isn't (25 points needed).
  await expect(cell(page, PRESENCE_OF_MIND)).toHaveAttribute("data-state", "open");
  await cell(page, PRESENCE_OF_MIND).hover();
  await expect(page.getByTestId("talent-tooltip")).toContainText("Presence of Mind");
});

test("the level caps the points; the level can't drop below what's spent", async ({ page }) => {
  await page.goto(`${MAGE}?lvl=10`);
  await expect(page.getByTestId("talent-points-spent")).toHaveText("0 of 1");
  await cell(page, ARCANE_FOCUS).click();
  await cell(page, ARCANE_FOCUS).click();
  await expect(cell(page, ARCANE_FOCUS)).toHaveAttribute("data-rank", "1");
  await expect(page.getByTestId("talent-add-blocked")).toHaveText(/No points left at this level/);
  await expect(page.getByRole("button", { name: "Level down" })).toBeDisabled();

  await page.getByRole("button", { name: "Level up" }).click();
  await expect(page).toHaveURL(/lvl=11/);
  await cell(page, ARCANE_FOCUS).click();
  await expect(cell(page, ARCANE_FOCUS)).toHaveAttribute("data-rank", "2");
  await expect(page.getByTestId("talent-points-left")).toHaveText("0 points");
});

test("the keyboard moves with arrows, Enter adds and Shift+Enter removes", async ({ page }) => {
  await page.goto(MAGE);
  await cell(page, ARCANE_SUBTLETY).focus();
  await page.keyboard.press("ArrowRight");
  await expect(cell(page, ARCANE_FOCUS)).toBeFocused();
  await expect(page.getByTestId("talent-tooltip")).toContainText("Arcane Focus");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(cell(page, ARCANE_FOCUS)).toHaveAttribute("data-rank", "2");
  await page.keyboard.press("Shift+Enter");
  await expect(cell(page, ARCANE_FOCUS)).toHaveAttribute("data-rank", "1");
  await page.keyboard.press("ArrowDown");
  await expect(cell(page, 1650)).toBeFocused();
});

test("Copy link copies a link that opens the same build", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${MAGE}?b=${TWENTY_IN_ARCANE}&lvl=40`);
  await cell(page, ARCANE_MIND).click();
  await page.getByTestId("talent-copy-link").click();
  await expect(page.getByTestId("talent-copy-link")).toHaveText("Copied");
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/wow-forever\/talents\/mage\?b=1-25300503110001--&lvl=40$/);

  const other = await context.newPage();
  await other.goto(link);
  await expect(cell(other, ARCANE_MIND)).toHaveAttribute("data-rank", "1");
  await expect(other.getByTestId("talent-points-spent")).toHaveText("21 of 31");
  await expect(other.getByRole("spinbutton", { name: "Level" })).toHaveValue("40");
});

test("a link with a build this class can't have starts empty and says so", async ({ page }) => {
  await page.goto(`${MAGE}?b=1-9--`);
  await expect(page.getByTestId("talent-broken-link")).toBeVisible();
  await expect(page.getByTestId("talent-points-spent")).toHaveText("0 of 51");
});

test("an unknown class says so and offers the picker", async ({ page }) => {
  await page.goto("/wow-forever/talents/deathknight");
  await expect(page.getByText(/There's no class called "deathknight"/)).toBeVisible();
  await expect(page.getByTestId("talent-class-picker").getByRole("link")).toHaveCount(9);
});

test("on a 375 px phone one tree shows at a time, behind tabs, with 44 px targets", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(MAGE);
  const tabs = page.getByRole("radiogroup", { name: "Talent tree" });
  await expect(tabs).toBeVisible();
  const visibleTrees = page.getByTestId("talent-tree").filter({ visible: true });
  await expect(visibleTrees).toHaveCount(1);
  await expect(visibleTrees).toContainText("Arcane");
  await tabs.getByRole("radio", { name: /^Fire/ }).click();
  await expect(visibleTrees).toHaveCount(1);
  await expect(visibleTrees).toContainText("Fire");
  expect(await noSideways(page)).toBeLessThanOrEqual(0);

  const box = await visibleTrees.getByTestId("talent-cell").first().boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  const plusBox = await page.getByRole("button", { name: "Level up" }).boundingBox();
  expect(plusBox?.height).toBeGreaterThanOrEqual(44);
});

test("the skeleton shows while a class's trees load, in the trees' places", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/data\/talents\/.*\.json/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(MAGE);
  const skeleton = page.getByTestId("talent-calculator-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(skeleton.getByTestId("talent-tree-skeleton")).toHaveCount(3);
  release();
  await expect(skeleton).toHaveCount(0);
  await expect(page.getByTestId("talent-tree")).toHaveCount(3);
});
