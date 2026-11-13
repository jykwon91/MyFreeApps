/**
 * WoW Forever talent calculator — picking a class, spending and taking back
 * points, row and prerequisite gating, the level cap, keyboard use, the share
 * link round trip, a broken link, the phone layout and the loading skeleton.
 * Also covers: spend order (`?o=`) and Compare to Classic toggle.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-talents
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { MIN_TOUCH_TARGET } from "@platform/ui/test-support/constants/minTouchTarget";

const MAGE = "/wow-forever/talents/mage";
// Mage Arcane talent ids (Blizzard's Game Data API), in the live tree.
const WAND_SPECIALIZATION = 135345; // row 1, column 1
const IMPROVED_CHANNELING = 135343; // row 1, column 2, 5 ranks, every rank changed from Classic
const ARCANE_SUBTLETY = 135342; // row 2, column 1
const MAGIC_ABSORPTION = 135341; // row 2, column 2
const ARCANE_CONCENTRATION = 135340; // row 2, column 3, 5 ranks
const MISSILE_BARRAGE = 135339; // row 2, new in Forever
const ARCANE_MEDITATION = 135333; // row 4, needs Arcane Concentration 5/5
const PRESENCE_OF_MIND = 135331; // row 5
// Arcane: Wand 2, Channeling 5, Resilience 3, Subtlety 2, Absorption 2, Concentration 5, Geometry 1 = 20 points.
const TWENTY_IN_ARCANE = "2-25322501--";

function cell(page: Page, talentId: number) {
  return page.locator(`[data-testid="talent-cell"][data-talent-id="${talentId}"]`);
}

async function noSideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("pick a class, spend points, open the next row and take a point back", async ({ page }) => {
  await page.goto("/wow-forever/talents");
  await expect(page.getByRole("heading", { level: 1, name: "Talent calculator" })).toBeVisible();
  await expect(page.getByText("Pick a class to start.")).toBeVisible();
  await page.getByTestId("talent-class-picker").getByRole("link", { name: "Mage" }).click();
  await expect(page).toHaveURL(MAGE);
  await expect(page.getByRole("heading", { level: 1, name: "Mage talents" })).toBeVisible();
  await expect(page).toHaveTitle(/Mage talents/);
  await expect(page.getByTestId("talent-tree")).toHaveCount(3);

  await expect(cell(page, ARCANE_SUBTLETY)).toHaveAttribute("data-state", "locked");
  await cell(page, IMPROVED_CHANNELING).click();
  // Rank 1 is the live game's text, changed from Classic (Arcane Blast and Wrath vs interruption); the details say both.
  const details = page.getByTestId("talent-details");
  await expect(details.getByTestId("talent-details-rank")).toHaveText("rank 1/5");
  const rank1 = details.getByTestId("talent-rank-line").first();
  await expect(rank1).toContainText("Arcane Missiles spell a 20% chance and your Arcane Blast and Arcane Wrath spells a 14% chance");
  await expect(rank1.getByTestId("provenance-badge").first()).toHaveAttribute("data-provenance", "published");
  await expect(rank1.getByTestId("talent-classic-text")).toContainText("Changed in Forever");
  await expect(rank1.getByTestId("talent-classic-text")).toContainText("20% chance to avoid interruption");
  await expect(rank1.getByTestId("talent-classic-text").getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "classic");
  for (let i = 0; i < 4; i += 1) await cell(page, IMPROVED_CHANNELING).click();
  await expect(cell(page, IMPROVED_CHANNELING)).toHaveAttribute("data-rank", "5");
  await expect(cell(page, IMPROVED_CHANNELING)).toHaveAttribute("data-state", "maxed");
  // A sixth click does nothing.
  await cell(page, IMPROVED_CHANNELING).click();
  await expect(cell(page, IMPROVED_CHANNELING)).toHaveAttribute("data-rank", "5");
  await expect(page).toHaveURL(/[?&]b=2-05--(&|$)/);
  await expect(page.getByTestId("talent-points-spent")).toHaveText("5 of 51");
  await expect(page.getByTestId("talent-split")).toHaveText("5 / 0 / 0");

  // Row 2 is open now.
  await expect(cell(page, ARCANE_SUBTLETY)).toHaveAttribute("data-state", "open");
  await cell(page, ARCANE_SUBTLETY).click();
  await expect(cell(page, ARCANE_SUBTLETY)).toHaveAttribute("data-rank", "1");

  // Right-click takes a point out — but not one row 2 needs.
  await cell(page, IMPROVED_CHANNELING).click({ button: "right" });
  await expect(cell(page, IMPROVED_CHANNELING)).toHaveAttribute("data-rank", "5");
  await cell(page, ARCANE_SUBTLETY).click({ button: "right" });
  await expect(cell(page, ARCANE_SUBTLETY)).toHaveAttribute("data-rank", "0");
  await cell(page, IMPROVED_CHANNELING).click({ button: "right" });
  await expect(cell(page, IMPROVED_CHANNELING)).toHaveAttribute("data-rank", "4");

  // Rank 4 is the live game's text too, with Classic's rank 4 beside it; − / + work without right-click.
  await expect(details.getByRole("heading", { name: /Improved Channeling/ })).toBeVisible();
  await expect(details.getByTestId("talent-details-rank")).toHaveText("rank 4/5");
  const rank4 = details.getByTestId("talent-rank-line").first();
  await expect(rank4).toContainText("Arcane Missiles spell a 80% chance and your Arcane Blast and Arcane Wrath spells a 56% chance");
  await expect(rank4.getByTestId("provenance-badge").first()).toHaveAttribute("data-provenance", "published");
  await expect(rank4.getByTestId("talent-classic-text")).toContainText("80% chance to avoid interruption");
  await expect(rank4.getByTestId("talent-classic-text").getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "classic");
  await details.getByRole("button", { name: "Add a point to Improved Channeling" }).click();
  await expect(cell(page, IMPROVED_CHANNELING)).toHaveAttribute("data-rank", "5");

  // Reset clears the build and the link.
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByTestId("talent-points-spent")).toHaveText("0 of 51");
  await expect(page).toHaveURL(MAGE);
});

test("a prerequisite and the rows above gate a talent; a dependent blocks removal", async ({ page }) => {
  await page.goto(`${MAGE}?b=${TWENTY_IN_ARCANE}`);
  await expect(page.getByTestId("talent-points-spent")).toHaveText("20 of 51");
  // Arcane Meditation needs Arcane Concentration at 5/5 (met) and 15 points above row 4 (met).
  await expect(cell(page, ARCANE_MEDITATION)).toHaveAttribute("data-state", "open");
  await expect(page.locator('[data-testid="talent-arrows"] g[data-met="true"]')).toHaveCount(1);
  await cell(page, ARCANE_MEDITATION).click();
  await expect(cell(page, ARCANE_MEDITATION)).toHaveAttribute("data-rank", "1");

  // Arcane Concentration can't lose a point while Arcane Meditation depends on it.
  await cell(page, ARCANE_CONCENTRATION).click({ button: "right" });
  await expect(cell(page, ARCANE_CONCENTRATION)).toHaveAttribute("data-rank", "5");
  await expect(page.getByTestId("talent-details")).toContainText("Arcane Meditation needs these points");

  // Presence of Mind's row (20 points needed) is open.
  await expect(cell(page, PRESENCE_OF_MIND)).toHaveAttribute("data-state", "open");
  await cell(page, PRESENCE_OF_MIND).hover();
  await expect(page.getByTestId("talent-tooltip")).toContainText("Presence of Mind");
});

test("the level caps the points; the level can't drop below what's spent", async ({ page }) => {
  await page.goto(`${MAGE}?lvl=10`);
  await expect(page.getByTestId("talent-points-spent")).toHaveText("0 of 1");
  await cell(page, IMPROVED_CHANNELING).click();
  await cell(page, IMPROVED_CHANNELING).click();
  await expect(cell(page, IMPROVED_CHANNELING)).toHaveAttribute("data-rank", "1");
  await expect(page.getByTestId("talent-add-blocked")).toHaveText(/No points left at this level/);
  await expect(page.getByRole("button", { name: "Level down" })).toBeDisabled();

  await page.getByRole("button", { name: "Level up" }).click();
  await expect(page).toHaveURL(/lvl=11/);
  await cell(page, IMPROVED_CHANNELING).click();
  await expect(cell(page, IMPROVED_CHANNELING)).toHaveAttribute("data-rank", "2");
  await expect(page.getByTestId("talent-points-left")).toHaveText("0 points");
});

test("the keyboard moves with arrows, Enter adds and Shift+Enter removes", async ({ page }) => {
  await page.goto(MAGE);
  await cell(page, WAND_SPECIALIZATION).focus();
  await page.keyboard.press("ArrowRight");
  await expect(cell(page, IMPROVED_CHANNELING)).toBeFocused();
  await expect(page.getByTestId("talent-tooltip")).toContainText("Improved Channeling");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(cell(page, IMPROVED_CHANNELING)).toHaveAttribute("data-rank", "2");
  await page.keyboard.press("Shift+Enter");
  await expect(cell(page, IMPROVED_CHANNELING)).toHaveAttribute("data-rank", "1");
  await page.keyboard.press("ArrowDown");
  await expect(cell(page, MAGIC_ABSORPTION)).toBeFocused();
});

test("Copy link copies a link that opens the same build", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${MAGE}?b=${TWENTY_IN_ARCANE}&lvl=40`);
  await cell(page, ARCANE_MEDITATION).click();
  await page.getByTestId("talent-copy-link").click();
  await expect(page.getByTestId("talent-copy-link")).toHaveText("Copied");
  const link = await page.evaluate(() => navigator.clipboard.readText());
  // The link now also contains ?o= for the spend order; check the build and level are present.
  expect(link).toMatch(/\/wow-forever\/talents\/mage\?b=2-2532250100001--&lvl=40/);

  const other = await context.newPage();
  await stubUnmatchedApi(other);
  await other.goto(link);
  await expect(cell(other, ARCANE_MEDITATION)).toHaveAttribute("data-rank", "1");
  await expect(other.getByTestId("talent-points-spent")).toHaveText("21 of 31");
  await expect(other.getByRole("spinbutton", { name: "Level" })).toHaveValue("40");
});

test("a link with a build this class can't have starts empty and says so", async ({ page }) => {
  await page.goto(`${MAGE}?b=2-9--`);
  await expect(page.getByTestId("talent-broken-link")).toBeVisible();
  await expect(page.getByTestId("talent-points-spent")).toHaveText("0 of 51");
});

test("a version-1 link (the old Classic trees) starts empty and says so", async ({ page }) => {
  await page.goto(`${MAGE}?b=1-2530050311--`);
  await expect(page.getByTestId("talent-broken-link")).toBeVisible();
  await expect(page.getByTestId("talent-points-spent")).toHaveText("0 of 51");
  await expect(page.getByTestId("talent-tree")).toHaveCount(3);
  await expect(page.getByTestId("talent-order-list")).not.toBeVisible();
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
  expect(box?.width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  expect(box?.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  const plusBox = await page.getByRole("button", { name: "Level up" }).boundingBox();
  expect(plusBox?.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
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

// ── Talent spend order ────────────────────────────────────────────────────────

test("spending points records the order and updates the share URL with ?o=", async ({ page }) => {
  await page.goto(MAGE);
  // Before any point: no order list yet.
  await expect(page.getByTestId("talent-order-list")).not.toBeVisible();

  await cell(page, IMPROVED_CHANNELING).click(); // Level 10 — first point
  await expect(page.getByTestId("talent-order-list")).toBeVisible();
  const entries = page.getByTestId("talent-order-entries").getByRole("listitem");
  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText("Level 10");
  await expect(entries.first()).toContainText("Improved Channeling");
  // URL carries ?o=
  await expect(page).toHaveURL(/[?&]o=/);

  await cell(page, IMPROVED_CHANNELING).click(); // Level 11 — second point
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(1)).toContainText("Level 11");
});

test("the undo button on the last order entry removes that point", async ({ page }) => {
  await page.goto(MAGE);
  await cell(page, IMPROVED_CHANNELING).click();
  await cell(page, IMPROVED_CHANNELING).click();
  const entries = page.getByTestId("talent-order-entries").getByRole("listitem");
  await expect(entries).toHaveCount(2);
  await expect(cell(page, IMPROVED_CHANNELING)).toHaveAttribute("data-rank", "2");

  await page.getByTestId("talent-order-undo").click();
  await expect(entries).toHaveCount(1);
  await expect(cell(page, IMPROVED_CHANNELING)).toHaveAttribute("data-rank", "1");
});

test("a share URL with ?o= reloads with the same order list", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(MAGE);
  await cell(page, IMPROVED_CHANNELING).click();
  await cell(page, IMPROVED_CHANNELING).click();
  await cell(page, IMPROVED_CHANNELING).click();
  await page.getByTestId("talent-copy-link").click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/[?&]o=/);

  const other = await context.newPage();
  await stubUnmatchedApi(other);
  await other.goto(link);
  const entries = other.getByTestId("talent-order-entries").getByRole("listitem");
  await expect(entries).toHaveCount(3);
  await expect(entries.first()).toContainText("Level 10");
  await expect(entries.last()).toContainText("Level 12");
});

test("an old ?b=-only link (no ?o=) still loads without an order list", async ({ page }) => {
  await page.goto(`${MAGE}?b=${TWENTY_IN_ARCANE}`);
  await expect(page.getByTestId("talent-points-spent")).toHaveText("20 of 51");
  // No order info → no order list shown.
  await expect(page.getByTestId("talent-order-list")).not.toBeVisible();
  // URL has no ?o= param.
  expect(page.url()).not.toMatch(/[?&]o=/);
});

test("Reset clears the order list and removes ?o= from the URL", async ({ page }) => {
  await page.goto(MAGE);
  await cell(page, IMPROVED_CHANNELING).click();
  await expect(page.getByTestId("talent-order-list")).toBeVisible();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByTestId("talent-order-list")).not.toBeVisible();
  expect(page.url()).not.toMatch(/[?&]o=/);
});

test("order list is collapsible and no sideways scroll at 375 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(MAGE);
  await cell(page, IMPROVED_CHANNELING).click();
  const list = page.getByTestId("talent-order-list");
  await expect(list).toBeVisible();
  // Collapse
  await list.getByRole("button", { name: /Spend order/ }).click();
  await expect(page.getByTestId("talent-order-entries")).not.toBeVisible();
  // Expand
  await list.getByRole("button", { name: /Spend order/ }).click();
  await expect(page.getByTestId("talent-order-entries")).toBeVisible();
  expect(await noSideways(page)).toBeLessThanOrEqual(0);
});

// ── Compare to Classic ────────────────────────────────────────────────────────

test("Compare to Classic toggle highlights changed talents and shows a note", async ({ page }) => {
  await page.goto(MAGE);
  const toggle = page.getByTestId("talent-compare-toggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  // Before toggling: no compare dots.
  await expect(page.getByTestId("talent-compare-dot")).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  // Compare note appears.
  await expect(page.getByTestId("talent-compare-note")).toBeVisible();
  // Changed talents get a dot (Improved Channeling is known to be changed in Mage data).
  const dots = page.getByTestId("talent-compare-dot");
  await expect(dots).not.toHaveCount(0);

  // Clicking the toggle again turns it off.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("talent-compare-dot")).toHaveCount(0);
});

test("picking a changed talent in compare mode shows a 'Changed in Forever' badge", async ({ page }) => {
  await page.goto(MAGE);
  await page.getByTestId("talent-compare-toggle").click();
  // Improved Channeling is changed (classic text shown in existing tests).
  await cell(page, IMPROVED_CHANNELING).click();
  const details = page.getByTestId("talent-details");
  await expect(details.getByTestId("talent-compare-changed-badge")).toBeVisible();
  await expect(details.getByTestId("talent-compare-changed-badge")).toHaveText("Changed in Forever");
  // All ranks are shown (compare mode shows full rank table).
  await expect(details.getByTestId("talent-rank-line")).not.toHaveCount(0);
});

test("picking an unchanged talent in compare mode shows 'Same as Classic Era'", async ({ page }) => {
  await page.goto(MAGE);
  await page.getByTestId("talent-compare-toggle").click();
  // Wand Specialization reads the same as in Classic.
  const wandCell = cell(page, WAND_SPECIALIZATION);
  await expect(wandCell.getByTestId("talent-compare-dot")).toHaveCount(0);
  await wandCell.click();
  const details = page.getByTestId("talent-details");
  await expect(details.getByTestId("talent-compare-unchanged")).toHaveText("Same as Classic Era.");
  await expect(details.getByTestId("talent-compare-changed-badge")).toHaveCount(0);
});

test("picking a talent Classic doesn't have in compare mode shows 'New in Forever'", async ({ page }) => {
  await page.goto(MAGE);
  await page.getByTestId("talent-compare-toggle").click();
  const barrageCell = cell(page, MISSILE_BARRAGE);
  await expect(barrageCell.getByTestId("talent-compare-dot")).toHaveCount(1);
  await barrageCell.click();
  const details = page.getByTestId("talent-details");
  await expect(details.getByTestId("talent-compare-new-badge")).toHaveText("New in Forever");
  await expect(details.getByTestId("talent-compare-unchanged")).toHaveCount(0);
  await expect(details.getByTestId("talent-classic-text")).toHaveCount(0);
});

test("compare mode at 375 px has no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(MAGE);
  await page.getByTestId("talent-compare-toggle").click();
  expect(await noSideways(page)).toBeLessThanOrEqual(0);
});
