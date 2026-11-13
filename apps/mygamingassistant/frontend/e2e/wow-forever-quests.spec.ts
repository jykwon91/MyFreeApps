/**
 * WoW Forever Quest Database — E2E coverage for:
 *   - /wow-forever/quests: list page (search box, filters, count, empty state,
 *     loading skeleton, mobile layout, URL state)
 *   - /wow-forever/quests/:id: detail page (not found, loading skeleton, layout)
 *   - Hub tile navigation to the Quests page
 *   - "View full quest details" link on the dungeon page
 *   - What's New entry
 *
 * Runs against the committed quest data (Classic data plus quests seen in
 * the Forever game files).
 *
 * Run: npx playwright test --config e2e/playwright.config.ts wow-forever-quests
 */
import { test, expect, type Page } from "@playwright/test";

const QUESTS = "/wow-forever/quests";
const HUB = "/wow-forever";
const DEADMINES = "/wow-forever/dungeons/deadmines";

/** Quest 166 = The Defias Brotherhood; shard = 166 % 64 = 38. */
const DEFIAS_BROTHERHOOD = 166;
const DEFIAS_QUEST_PATH = `/wow-forever/quests/${DEFIAS_BROTHERHOOD}`;
/** Quest 65602 has no Classic data; it's only known from the Forever quest cache. */
const SEEN_ONLY_QUEST_PATH = "/wow-forever/quests/65602";

async function noSideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// ---------------------------------------------------------------------------
// Quest list page
// ---------------------------------------------------------------------------

test("the quest list page has the right title, heading and document title", async ({ page }) => {
  await page.goto(QUESTS);
  await expect(page.getByRole("heading", { level: 1, name: "Quests" })).toBeVisible();
  await expect(page).toHaveTitle(/Quests · WoW Forever/);
  await expect(page.getByRole("link", { name: "Back to WoW Forever" })).toHaveAttribute("href", HUB);
  await expect(page.locator('a[href*="wowhead"]')).toHaveCount(0);
});

test("the quest list shows the search input, filters panel and count", async ({ page }) => {
  await page.goto(QUESTS);
  // Search box
  await expect(page.getByTestId("quest-search")).toBeVisible();
  // Filters panel (always visible on desktop sm:block)
  await expect(page.getByTestId("quest-filters")).toBeVisible();
  await expect(page.getByTestId("quest-count")).toContainText(/[1-9][\d,]* quests/);
  await expect(page.getByTestId("quest-list").getByTestId("quest-row").first()).toBeVisible();
  // Quests in the game files without a name are counted, not listed.
  await expect(page.getByTestId("quest-unnamed-note")).toContainText("without a name yet");
});

test("searching by name finds the quest and opens its page", async ({ page }) => {
  await page.goto(QUESTS);
  await page.getByTestId("quest-search").fill("defias brotherhood");
  const row = page.locator(`[data-testid="quest-row"][data-quest-id="${DEFIAS_BROTHERHOOD}"]`);
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: /The Defias Brotherhood/ }).first().click();
  await expect(page).toHaveURL(DEFIAS_QUEST_PATH);
  await expect(page.getByTestId("quest-title")).toHaveText("The Defias Brotherhood");
});

test("the quest list shows empty state when no quests match", async ({ page }) => {
  await page.goto(`${QUESTS}?q=zzqqxxnotaquest`);
  await expect(page.getByTestId("quest-empty")).toBeVisible();
  await expect(page.getByTestId("quest-empty")).toContainText("No quests match these filters");
});

test("the search query and filters round-trip through the URL", async ({ page }) => {
  await page.goto(QUESTS);
  // Type a search
  await page.getByTestId("quest-search").fill("defias");
  await expect(page).toHaveURL(/q=defias/);
  // Reload — query is preserved
  await page.reload();
  await expect(page.getByTestId("quest-search")).toHaveValue("defias");
});

test("filters panel opens and closes on mobile with the toggle", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto(QUESTS);
  const toggle = page.getByTestId("quest-filters-toggle");
  const filters = page.getByTestId("quest-filters");
  // Panel hidden initially on mobile
  await expect(toggle).toBeVisible();
  await expect(filters).toBeHidden();
  await toggle.click();
  await expect(filters).toBeVisible();
  await toggle.click();
  await expect(filters).toBeHidden();
});

test("the filters panel has faction, level and Forever toggles", async ({ page }) => {
  await page.goto(QUESTS);
  // On desktop the filters panel is always visible (sm:block override).
  const filters = page.getByTestId("quest-filters");
  await expect(filters).toBeVisible();
  // Faction buttons
  await expect(filters.getByRole("button", { name: "Alliance" })).toBeVisible();
  await expect(filters.getByRole("button", { name: "Horde" })).toBeVisible();
  await expect(filters.getByRole("button", { name: "Neutral" })).toBeVisible();
  // "New in Forever" button
  await expect(filters.getByTestId("quest-filter-new")).toBeVisible();
  // Level filter
  await expect(filters.getByTestId("quest-filter-level")).toBeVisible();
});

test("faction filter button sets the side param in the URL", async ({ page }) => {
  await page.goto(QUESTS);
  // Filters panel is always visible on desktop — no toggle click needed.
  await page.getByTestId("quest-filters").getByRole("button", { name: "Alliance" }).click();
  await expect(page).toHaveURL(/side=A/);
  // Reset clears it
  await page.getByTestId("quest-filters-reset").click();
  await expect(page).not.toHaveURL(/side=/);
});

test("New in Forever filter sets the new param", async ({ page }) => {
  await page.goto(QUESTS);
  // Filters panel is always visible on desktop — no toggle click needed.
  await page.getByTestId("quest-filter-new").click();
  await expect(page).toHaveURL(/new=1/);
  await page.getByTestId("quest-filter-new").click();
  await expect(page).not.toHaveURL(/new=1/);
});

// ---------------------------------------------------------------------------
// Quest list skeleton
// ---------------------------------------------------------------------------

test("the quest list skeleton shows while the index loads, then the list", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  // Intercept the quest index JSON (served as a module by Vite dev server).
  await page.route(/data\/quests\/questIndex/, async (route) => {
    await held;
    await route.continue();
  });

  await page.goto(QUESTS);
  const skeleton = page.getByTestId("quest-list-skeleton");
  await expect(skeleton).toBeVisible();
  // The skeleton has the same number of rows as QUEST_PAGE_SIZE (capped at 12)
  await expect(skeleton.getByTestId("quest-list-skeleton-row")).toHaveCount(12);

  release();
  await expect(skeleton).toHaveCount(0);
  // Count appears once load completes
  await expect(page.getByTestId("quest-count")).toBeVisible();
});

// ---------------------------------------------------------------------------
// Mobile layout on quest list
// ---------------------------------------------------------------------------

test.describe("at 375px", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("the quest list fits the phone with no horizontal overflow", async ({ page }) => {
    await page.goto(QUESTS);
    await expect(page.getByTestId("quest-search")).toBeVisible();
    // No horizontal scroll
    expect(await noSideways(page)).toBeLessThanOrEqual(0);
  });

  test("the filter toggle has a 44px+ touch target", async ({ page }) => {
    await page.goto(QUESTS);
    const toggle = page.getByTestId("quest-filters-toggle");
    const box = await toggle.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  });
});

// ---------------------------------------------------------------------------
// Quest detail page
// ---------------------------------------------------------------------------

test("a quest page says whether it can be shared and links every quest in its line", async ({ page }) => {
  await page.goto("/wow-forever/quests/373");
  await expect(page.getByTestId("quest-title")).toHaveText("The Unsent Letter");
  await expect(page.getByTestId("quest-sharing")).toHaveText("Can't share");
  await expect(page.getByTestId("quest-step")).toHaveText("Step 1 of 12");
  await expect(page.getByTestId("quest-sharing-detail")).toContainText("get it themselves");
  const line = page.getByTestId("quest-chain");
  await expect(line.getByRole("listitem")).toHaveCount(12);
  await expect(line.getByRole("listitem").first()).toContainText("this quest");
  await line.getByRole("listitem").nth(1).getByRole("link").click();
  await expect(page).toHaveURL("/wow-forever/quests/389");
  await expect(page.getByTestId("quest-step")).toHaveText("Step 2 of 12");
});

test("a quest not in our data shows 'Quest not found'", async ({ page }) => {
  // ID 999999 — not in any shard and never seen in game
  await page.goto("/wow-forever/quests/999999");
  await expect(page.getByRole("heading", { level: 1, name: "Quest not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Quests" })).toHaveAttribute("href", QUESTS);
  await expect(page.locator('a[href*="wowhead"]')).toHaveCount(0);
});

test("the quest detail page has the right document title while loading", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/data\/quests\/classic\//, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(DEFIAS_QUEST_PATH);
  await expect(page).toHaveTitle(/Quest · WoW Forever/);
  release();
  await expect(page.getByTestId("quest-title")).toHaveText("The Defias Brotherhood");
  await expect(page).toHaveTitle(/The Defias Brotherhood/);
});

test("a quest known only from the Forever game files has its own page", async ({ page }) => {
  await page.goto(SEEN_ONLY_QUEST_PATH);
  await expect(page.getByTestId("quest-title")).toHaveText("What Is Love?");
  await expect(page.getByText("Who gives this quest isn't in our data.")).toBeVisible();
});

test("the quest detail skeleton shows while the shard loads", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/data\/quests\/classic\//, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(DEFIAS_QUEST_PATH);
  const skeleton = page.getByTestId("quest-detail-skeleton");
  await expect(skeleton).toBeVisible();
  release();
  // Skeleton goes away once load completes
  await expect(skeleton).toHaveCount(0);
});

test("an invalid quest id shows 'Quest not found'", async ({ page }) => {
  await page.goto("/wow-forever/quests/not-a-number");
  await expect(page.getByRole("heading", { level: 1, name: "Quest not found" })).toBeVisible();
});

test("quest detail 'back to quests' link goes back with correct URL", async ({ page }) => {
  await page.goto(`${QUESTS}?q=defias&side=A`);
  // Navigate to a quest
  await page.goto(DEFIAS_QUEST_PATH);
  await page.getByRole("link", { name: "Back to Quests" }).click();
  // Ends up on the quests list page
  await expect(page).toHaveURL(new RegExp(`^.*${QUESTS}`));
  await expect(page.getByRole("heading", { level: 1, name: "Quests" })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Dungeon page → quest detail link
// ---------------------------------------------------------------------------

test("the dungeon page's quest rows have a 'View full quest details' link to the quest detail page", async ({ page }) => {
  await page.goto(DEADMINES);
  // Open The Defias Brotherhood quest row
  const row = page.locator(`[data-testid="dungeon-quest-row"][data-quest-id="${DEFIAS_BROTHERHOOD}"]`);
  await row.getByTestId("dungeon-quest-toggle").click();
  // The link should exist and point to the quest detail page
  const link = row.getByTestId("view-quest-link");
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", DEFIAS_QUEST_PATH);
  await expect(link).toContainText("View full quest details");
});

test("clicking 'View full quest details' navigates to the quest detail page", async ({ page }) => {
  await page.goto(DEADMINES);
  const row = page.locator(`[data-testid="dungeon-quest-row"][data-quest-id="${DEFIAS_BROTHERHOOD}"]`);
  await row.getByTestId("dungeon-quest-toggle").click();
  await row.getByTestId("view-quest-link").click();
  await expect(page).toHaveURL(DEFIAS_QUEST_PATH);
  // The Back link goes back to Quests
  await expect(page.getByRole("link", { name: "Back to Quests" })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Hub tile and What's New
// ---------------------------------------------------------------------------

test("the WoW Forever hub has a Quests tile linking to the quest list", async ({ page }) => {
  await page.goto(HUB);
  const questsLink = page.getByRole("main").locator(`a[href="${QUESTS}"]`).first();
  await expect(questsLink).toBeVisible();
  await questsLink.click();
  await expect(page).toHaveURL(QUESTS);
});

test("the What's New section lists the Quests entry", async ({ page }) => {
  await page.goto(HUB);
  // The What's New list is an <ol id="wow-whats-new-list">
  const whatsNew = page.locator("#wow-whats-new-list");
  await expect(whatsNew).toBeVisible();
  // Newer entries push it past the first few: open the whole list.
  await page.getByRole("button", { name: /Show all/ }).click();
  await expect(whatsNew.getByRole("link", { name: /Quests/ }).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// No wowhead links anywhere on quest pages
// ---------------------------------------------------------------------------

test("quest pages have no wowhead links", async ({ page }) => {
  await page.goto(QUESTS);
  await expect(page.locator('a[href*="wowhead"]')).toHaveCount(0);
  await page.goto(DEFIAS_QUEST_PATH);
  await expect(page.locator('a[href*="wowhead"]')).toHaveCount(0);
});
