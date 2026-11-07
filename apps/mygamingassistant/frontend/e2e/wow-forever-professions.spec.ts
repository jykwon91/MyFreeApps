/**
 * WoW Forever Professions guide (Cooking, Fishing, Tailoring, Enchanting, Alchemy, Blacksmithing, Leatherworking, Engineering) — static, frontend-only page.
 *
 * Run: npm run test:e2e -- wow-forever-professions
 */
import { test, expect } from "@playwright/test";

// Auction prices are covered with stubbed prices in wow-forever-auction-prices.spec.ts.
// Here the region has none, so the guides show their routes without costs.
test.beforeEach(async ({ page }) => {
  await page.route("**/wow/prices?region=*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        region: "us",
        credit: { source: "tsm", name: "TradeSkillMaster", url: "https://www.tradeskillmaster.com" },
        source_updated_at: null,
        fetched_at: null,
        columns: ["item_id", "market_value", "avg_sale_price", "historical", "sold_per_day", "name"],
        items: [],
      }),
    }),
  );
});

test("reaches the page from the landing card and leads with training", async ({ page }) => {
  await page.goto("/wow-forever");
  await page.getByRole("link", { name: /^Professions/ }).click();
  await expect(page).toHaveURL(/\/wow-forever\/professions$/);
  await expect(page.getByRole("radio", { name: "Cooking" })).toBeChecked();
  await expect(page.getByRole("heading", { name: /train it first/i })).toBeVisible();
  await expect(page.getByText("Stephen Ryback")).toBeVisible();
});

test("switches to Fishing and Horde, and the route follows", async ({ page }) => {
  await page.goto("/wow-forever/professions");
  await page.getByRole("radio", { name: "Fishing" }).click();
  await expect(page).toHaveURL(/\?p=fishing$/);
  await page.getByRole("radio", { name: "Horde" }).click();
  await expect(page.getByText("Lumak")).toBeVisible();
  await expect(page.getByText("Arnold Leland")).toHaveCount(0);

  const route = page.locator("#route");
  await expect(route.getByText("Durotar, Mulgore or Tirisfal Glades lakes and rivers")).toBeVisible();
  await expect(route.getByText("Artisan quest: Nat Pagle, Angler Extreme")).toBeVisible();
});

test("jump links scroll to each section", async ({ page }) => {
  await page.goto("/wow-forever/professions");
  await page.getByRole("link", { name: "Leveling route" }).click();
  await expect(page).toHaveURL(/#route$/);
  await expect(page.locator("#route").getByText("Spiced Wolf Meat")).toBeInViewport();
});

test("the phone layout never scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/wow-forever/professions");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("Tailoring shows the route for your skill and a shopping list", async ({ page }) => {
  await page.goto("/wow-forever/professions");
  await page.getByRole("radio", { name: "Tailoring" }).click();
  await expect(page).toHaveURL(/\?p=tailoring$/);
  await expect(page.getByLabel("Get started: train it first").getByText("Georgio Bolero")).toBeVisible();

  const route = page.locator("#route");
  await route.getByLabel("Your skill").fill("120");
  await expect(page).toHaveURL(/skill=120/);
  await expect(route.locator('[aria-current="step"]')).toBeVisible();
  await expect(route.getByText("You are here")).toBeVisible();

  const shopping = page.locator("#shopping");
  await shopping.locator("summary").first().click();
  await expect(shopping.getByRole("button", { name: /Copy list/ })).toBeVisible();

  // Each material opens to where to get it.
  const fineThread = shopping.locator('details[data-mat="2321"]');
  await expect(fineThread.getByText("Sold in most towns")).toBeVisible();
  await fineThread.locator("summary").click();
  await expect(fineThread.getByText("Sold by")).toBeVisible();
});

test("Enchanting sends you to Uldaman for Artisan", async ({ page }) => {
  await page.goto("/wow-forever/professions?p=enchanting");
  const route = page.locator("#route");
  await expect(route.getByText("Annora")).toBeVisible();
  await expect(route.getByRole("link", { name: /Uldaman/ }).first()).toHaveAttribute("href", /npc=classic-i-286/);
});

test("Enchanting says when to disenchant and when to sell", async ({ page }) => {
  await page.goto("/wow-forever/professions?p=enchanting");
  await page.getByRole("link", { name: "Disenchant or sell?" }).click();
  await expect(page).toHaveURL(/#disenchant$/);
  const rules = page.locator("#disenchant");
  await expect(rules.locator('[data-rule="blue"]').getByText("Check the price first")).toBeInViewport();
  await expect(rules.locator('[data-rule="gray-white"]').getByText("Vendor it")).toBeVisible();
});

test("the crafting guides never scroll sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const p of ["tailoring", "enchanting", "alchemy", "blacksmithing", "leatherworking", "engineering"]) {
    await page.goto(`/wow-forever/professions?p=${p}&skill=150`);
    await expect(page.locator("#route").getByText("You are here")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, p).toBeLessThanOrEqual(0);
  }
});

test("your level is kept, so material drops are ranked for it", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00Z"));
  await page.goto("/wow-forever/professions?p=tailoring");
  const level = page.getByRole("spinbutton", { name: "Your level" });
  await level.fill("20");
  await expect(page.getByText("Stops at level 30 until launch — 60 from Nov 4.")).toBeVisible();
  await page.reload();
  await expect(level).toHaveValue("20");
});

test("cloth points at a farm spot you can handle at your level", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00Z"));
  await page.goto("/wow-forever/professions?p=tailoring&skill=150");
  await page.getByRole("spinbutton", { name: "Your level" }).fill("30");
  const shopping = page.locator("#shopping");
  await shopping.locator("summary").first().click();
  const silk = shopping.locator('details[data-mat="4306"]').first();
  const line = (await silk.locator("summary").textContent()) ?? "";
  const [, , top] = line.match(/Drops from [^,]+, level (\d+)–(\d+)/) ?? [];
  expect(Number(top)).toBeLessThanOrEqual(34);
  await silk.locator("summary").click();
  await silk.getByRole("button", { name: /^Show \d+ more farm spots$/ }).click();
  await expect(silk.getByText("Too high for level 30").first()).toBeVisible();
});

test("the picker groups crafting and secondary professions, one choice across both", async ({ page }) => {
  await page.goto("/wow-forever/professions?p=enchanting");
  const crafting = page.getByRole("radiogroup", { name: "Crafting professions" });
  const secondary = page.getByRole("radiogroup", { name: "Secondary professions" });
  await expect(crafting.getByRole("radio", { name: "Enchanting" })).toBeChecked();
  await expect(secondary.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(crafting.getByRole("radio")).toHaveText(["Alchemy", "Blacksmithing", "Enchanting", "Engineering", "Leatherworking", "Tailoring"]);
  await expect(page.getByText(/You can learn two main professions, crafting or gathering \(Classic rule\)/)).toBeVisible();

  await secondary.getByRole("radio", { name: "Fishing" }).click();
  await expect(page).toHaveURL(/\?p=fishing$/);
  await expect(crafting.getByRole("radio", { checked: true })).toHaveCount(0);
});

test("an unknown profession link opens Cooking", async ({ page }) => {
  await page.goto("/wow-forever/professions?p=jewelcrafting");
  await expect(page.getByRole("radio", { name: "Cooking" })).toBeChecked();
});

test("every crafting radio fits inside the viewport and its group at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/wow-forever/professions?p=alchemy");
  const group = page.getByRole("radiogroup", { name: "Crafting professions" });
  const radios = group.getByRole("radio");
  await expect(radios).toHaveCount(6);

  const groupBox = await group.boundingBox();
  expect(groupBox).not.toBeNull();
  const viewportWidth = 375;

  const boxes = await Promise.all((await radios.all()).map((r) => r.boundingBox()));
  for (const box of boxes) {
    expect(box).not.toBeNull();
    // Touch target: at least 44px tall.
    expect(box!.height).toBeGreaterThanOrEqual(44);
    // Every radio must start inside the viewport.
    expect(box!.x).toBeGreaterThanOrEqual(0);
    // Every radio must end inside the viewport (no overflow off the right edge).
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth);
    // Every radio must be contained within its group.
    expect(box!.x).toBeGreaterThanOrEqual(groupBox!.x - 1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(groupBox!.x + groupBox!.width + 1);
  }
});

test("Alchemy shows a hand-picked herb route with no prices, and where each herb grows", async ({ page }) => {
  await page.goto("/wow-forever/professions");
  await page.getByRole("radio", { name: "Alchemy" }).click();
  await expect(page).toHaveURL(/\?p=alchemy$/);
  const start = page.getByLabel("Get started: train it first");
  await expect(start.getByText("Lilyssia Nightbreeze")).toBeVisible();
  await expect(start.getByText("Works well with Herbalism")).toBeVisible();

  const route = page.locator("#route");
  await route.getByLabel("Your skill").fill("150");
  await expect(page).toHaveURL(/skill=150/);
  await expect(route.getByText("Craft Lesser Mana Potion until 165.")).toBeVisible();
  await expect(route.locator('[aria-current="step"]').getByText("Lesser Mana Potion")).toBeVisible();
  // No auction prices in this region: no prices panel, no "cheapest" claim, no gold anywhere.
  await expect(page.getByRole("region", { name: "Prices", exact: true })).toHaveCount(0);
  await expect(page.getByText(/cheapest/i)).toHaveCount(0);
  await expect(page.locator("main").last()).not.toContainText(/\b\d+\s?[gsc]\b|\bgold\b|\bsilver\b/);
  await expect(route.getByRole("heading", { name: "Transmutes" })).toBeVisible();
  await expect(route.getByTestId("transmutes").getByText("Transmute: Legionite")).toBeVisible();

  const shopping = page.locator("#shopping");
  await shopping.locator("summary").first().click();
  await expect(shopping.getByText(/Don't sell your crafts yet/)).toBeVisible();
  const kelp = shopping.locator('details[data-mat="3820"]');
  await expect(kelp.locator("summary")).toContainText(/Herbalism \(skill \d+\): Stranglekelp, /);
  await kelp.locator("summary").click();
  await expect(kelp.getByText(/Gather with Herbalism \(skill \d+\) from/)).toBeVisible();
  await expect(kelp.getByRole("link", { name: /^Directions to Stranglekelp/ }).first()).toHaveAttribute("href", /\/wow-forever\/map\?to=/);
});

test("the loading skeleton keeps room for prices only where there are prices", async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/crafting\/(alchemy|blacksmithing|engineering|leatherworking|tailoring)\.json/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/wow-forever/professions?p=alchemy");
  const skeleton = page.getByTestId("craft-route-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(skeleton.getByTestId("craft-prices-skeleton")).toHaveCount(0);
  await page.getByRole("radio", { name: "Blacksmithing" }).click();
  await expect(skeleton).toBeVisible();
  await expect(skeleton.getByTestId("craft-prices-skeleton")).toHaveCount(0);
  await page.getByRole("radio", { name: "Leatherworking" }).click();
  await expect(skeleton).toBeVisible();
  await expect(skeleton.getByTestId("craft-prices-skeleton")).toHaveCount(0);
  await page.getByRole("radio", { name: "Engineering" }).click();
  await expect(skeleton).toBeVisible();
  await expect(skeleton.getByTestId("craft-prices-skeleton")).toHaveCount(0);
  await page.getByRole("radio", { name: "Tailoring" }).click();
  await expect(skeleton.getByTestId("craft-prices-skeleton")).toHaveCount(1);
  release();
  await expect(page.locator("#route").getByLabel("Your skill")).toBeVisible();
  await expect(skeleton).toHaveCount(0);
});

test("a route that fails to load names the profession and retries", async ({ page }) => {
  let fail = true;
  await page.route(/crafting\/alchemy\.json/, (route) => (fail ? route.abort() : route.continue()));
  await page.goto("/wow-forever/professions?p=alchemy");
  await expect(page.getByText("The Alchemy leveling route didn't load.")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator("#route").getByLabel("Your skill")).toBeVisible();
});

test("Blacksmithing forks at 200: pick a specialization and the route keeps only what you can learn", async ({ page }) => {
  await page.goto("/wow-forever/professions");
  await page.getByRole("radio", { name: "Blacksmithing" }).click();
  await expect(page).toHaveURL(/\?p=blacksmithing$/);
  const start = page.getByLabel("Get started: train it first");
  await expect(start.getByText("Works well with Mining")).toBeVisible();
  await expect(start.getByText("Get a Blacksmith Hammer before your first belt")).toBeVisible();

  const route = page.locator("#route");
  await route.getByLabel("Your skill").fill("150");
  await expect(route.getByText("Craft Bronze Warhammer until 165.")).toBeVisible();
  const decision = route.getByTestId("spec-decision");
  await expect(decision).toContainText("At 200: choose a specialization");
  await expect(decision).toContainText("Classic: needs level 40");
  const armorsmith = decision.getByTestId("spec-armorsmith");
  await expect(armorsmith).toContainText("Hand in:");
  await expect(armorsmith.getByRole("link", { name: /^Directions to / })).toHaveAttribute("href", /\/wow-forever\/map\?to=/);

  // Not chosen yet: every option, each specialist one with its chip.
  await route.getByLabel("Your skill").fill("250");
  const options = route.locator('[aria-current="step"]');
  await expect(options.getByText("Truesilver Breastplate")).toBeVisible();
  await expect(options.getByText("Blight", { exact: true })).toBeVisible();
  await expect(options.getByTestId("spec-chip").first()).toBeVisible();

  const picker = page.getByRole("radiogroup", { name: "Your Blacksmithing specialization" });
  await expect(picker.getByRole("radio", { name: "Not chosen yet" })).toBeChecked();
  await picker.getByRole("radio", { name: "Armorsmith" }).click();
  await expect(page).toHaveURL(/spec=armorsmith/);
  await expect(options.getByText("Truesilver Breastplate")).toBeVisible();
  await expect(options.getByText("Blight", { exact: true })).toHaveCount(0);
  await expect(armorsmith).toContainText("Your choice");

  // Kept without the link.
  await page.goto("/wow-forever/professions?p=blacksmithing");
  await expect(page.getByRole("radiogroup", { name: "Your Blacksmithing specialization" }).getByRole("radio", { name: "Armorsmith" })).toBeChecked();

  // No auction prices in this region, so no prices anywhere; bars are smelted from ore.
  await expect(page.getByRole("region", { name: "Prices", exact: true })).toHaveCount(0);
  await expect(page.getByText(/cheapest/i)).toHaveCount(0);
  await expect(page.locator("main").last()).not.toContainText(/\b\d+\s?[gsc]\b|\bgold\b|\bsilver\b/);
  const shopping = page.locator("#shopping");
  await shopping.locator("summary").first().click();
  await expect(shopping.getByText(/Don't sell your crafts yet/)).toBeVisible();
  await shopping.getByRole("radio", { name: "Whole route" }).click();
  await expect(shopping.getByText("Smelt with Mining", { exact: true })).toBeVisible();
  await expect(shopping.getByText(/\d+ Copper Bar \(Mining 1\)/)).toBeVisible();
  await expect(shopping.locator('details[data-mat="2770"]').first()).toBeVisible();
});

test("Leatherworking forks at 225, and leather points at beasts to skin", async ({ page }) => {
  await page.goto("/wow-forever/professions");
  await page.getByRole("radio", { name: "Leatherworking" }).click();
  await expect(page).toHaveURL(/\?p=leatherworking$/);
  const start = page.getByLabel("Get started: train it first");
  await expect(start.getByText("Works well with Skinning")).toBeVisible();
  await expect(start.getByText("Skin your leather, or buy it")).toBeVisible();

  const route = page.locator("#route");
  await route.getByLabel("Your skill").fill("150");
  await expect(page).toHaveURL(/skill=150/);
  await expect(route.getByText("Craft Heavy Armor Kit until 155.")).toBeVisible();
  const decision = route.getByTestId("spec-decision");
  await expect(decision).toContainText("At 225: choose a specialization");
  await expect(decision).toContainText("Classic: needs level 40");
  await expect(decision.getByTestId("spec-tribal")).toBeVisible();

  // Not chosen yet: every option, each specialist one with its chip.
  await route.getByLabel("Your skill").fill("250");
  const options = route.locator('[aria-current="step"]');
  await expect(options.getByText("Wicked Leather Gauntlets", { exact: true })).toBeVisible();
  await expect(options.getByText("Dragonscale Breastplate", { exact: true })).toBeVisible();
  await expect(options.getByText("Chimeric Gloves", { exact: true })).toBeVisible();
  await expect(options.getByTestId("spec-chip").first()).toBeVisible();

  const picker = page.getByRole("radiogroup", { name: "Your Leatherworking specialization" });
  await expect(picker.getByRole("radio", { name: "Not chosen yet" })).toBeChecked();
  await picker.getByRole("radio", { name: "Tribal" }).click();
  await expect(page).toHaveURL(/spec=tribal/);
  await expect(options.getByText("Chimeric Gloves", { exact: true })).toBeVisible();
  await expect(options.getByText("Wicked Leather Gauntlets", { exact: true })).toBeVisible();
  await expect(options.getByText("Dragonscale Breastplate", { exact: true })).toHaveCount(0);

  // Kept without the link.
  await page.goto("/wow-forever/professions?p=leatherworking");
  await expect(page.getByRole("radiogroup", { name: "Your Leatherworking specialization" }).getByRole("radio", { name: "Tribal" })).toBeChecked();

  // No auction prices in this region, so no prices anywhere; leather is skinned, with directions to the beasts.
  await expect(page.getByRole("region", { name: "Prices", exact: true })).toHaveCount(0);
  await expect(page.getByText(/cheapest/i)).toHaveCount(0);
  await expect(page.locator("main").last()).not.toContainText(/\b\d+\s?[gsc]\b|\bgold\b|\bsilver\b/);
  const shopping = page.locator("#shopping");
  await shopping.locator("summary").first().click();
  await expect(shopping.getByText(/Don't sell your crafts yet/)).toBeVisible();
  await shopping.getByRole("radio", { name: "Whole route" }).click();
  const leather = shopping.locator('details[data-mat="2318"]').first();
  await expect(leather.locator("summary")).toContainText(/Skin beasts level \d+–\d+/);
  await leather.locator("summary").click();
  const beasts = leather.getByRole("list", { name: "Where to skin it" });
  await expect(beasts.getByRole("link", { name: /^Directions to / }).first()).toHaveAttribute("href", /\/wow-forever\/map\?to=pt/);
  await expect(leather.getByText(/You can also make it yourself with Light Leather/)).toBeVisible();
});

test("a Forever-only transmute shows a Source unknown chip with no Wowhead link", async ({ page }) => {
  // Transmute: Legionite (spell 1317279) is new in Forever — its source isn't known yet.
  await page.goto("/wow-forever/professions?p=alchemy");
  const transmutes = page.getByTestId("transmutes");
  const legionite = transmutes.locator("li", { has: page.getByText("Transmute: Legionite") });
  await expect(legionite.getByText("Source unknown")).toBeVisible();
  await expect(legionite.locator('a[href*="wowhead"]')).toHaveCount(0);
  await expect(legionite.getByRole("link", { name: /Wowhead/ })).toHaveCount(0);
});

test("Engineering says what each item does, forks at 200, and smelts its bars", async ({ page }) => {
  await page.goto("/wow-forever/professions");
  await page.getByRole("radio", { name: "Engineering" }).click();
  await expect(page).toHaveURL(/\?p=engineering$/);
  const start = page.getByLabel("Get started: train it first");
  await expect(start.getByText("Lilliam Sparkspindle")).toBeVisible();
  await expect(start.getByText("Works well with Mining")).toBeVisible();
  await expect(start.getByText("Get a Blacksmith Hammer before your first bolts")).toBeVisible();

  const route = page.locator("#route");
  await route.getByLabel("Your skill").fill("150");
  await expect(page).toHaveURL(/skill=150/);
  await expect(route.getByText("Craft Bronze Framework until 160.")).toBeVisible();
  const current = route.locator('[aria-current="step"]');
  await expect(current.getByTestId("craft-effect")).toHaveText("A part for other Engineering recipes.");
  // The client's own tooltip, with the damage it rolls as a range.
  await route.getByLabel("Your skill").fill("190");
  await expect(route.getByText("Craft Iron Grenade until 200.")).toBeVisible();
  await expect(current.getByTestId("craft-effect")).toHaveText(/^Inflicts 132 to 218 Fire damage/);

  const decision = route.getByTestId("spec-decision");
  await expect(decision).toContainText("At 200: choose a specialization");
  await expect(decision).toContainText("Classic: needs level 30");
  await expect(decision.getByTestId("spec-gnomish")).toBeVisible();
  await expect(decision.getByTestId("spec-goblin")).toBeVisible();

  // Not chosen yet: every option, each specialist one with its chip.
  await route.getByLabel("Your skill").fill("270");
  await expect(current.getByText("Thorium Widget", { exact: true })).toBeVisible();
  await expect(current.getByText("Gnomish Death Ray", { exact: true })).toBeVisible();
  await expect(current.getByText("Goblin Jumper Cables XL", { exact: true })).toBeVisible();
  await expect(current.getByTestId("spec-chip").first()).toBeVisible();

  const picker = page.getByRole("radiogroup", { name: "Your Engineering specialization" });
  await expect(picker.getByRole("radio", { name: "Not chosen yet" })).toBeChecked();
  await picker.getByRole("radio", { name: "Gnomish" }).click();
  await expect(page).toHaveURL(/spec=gnomish/);
  await expect(current.getByText("Gnomish Death Ray", { exact: true })).toBeVisible();
  await expect(current.getByText("Thorium Widget", { exact: true })).toBeVisible();
  await expect(current.getByText("Goblin Jumper Cables XL", { exact: true })).toHaveCount(0);

  // Kept without the link.
  await page.goto("/wow-forever/professions?p=engineering");
  await expect(page.getByRole("radiogroup", { name: "Your Engineering specialization" }).getByRole("radio", { name: "Gnomish" })).toBeChecked();

  // No auction prices in this region, so no prices anywhere; bars are smelted from ore.
  await expect(page.getByRole("region", { name: "Prices", exact: true })).toHaveCount(0);
  await expect(page.getByText(/cheapest/i)).toHaveCount(0);
  await expect(page.locator("main").last()).not.toContainText(/\b\d+\s?[gsc]\b|\bgold\b|\bsilver\b/);
  const shopping = page.locator("#shopping");
  await shopping.locator("summary").first().click();
  await expect(shopping.getByText(/Don't sell your crafts yet/)).toBeVisible();
  await shopping.getByRole("radio", { name: "Whole route" }).click();
  await expect(shopping.getByText("Smelt with Mining", { exact: true })).toBeVisible();
  await expect(shopping.getByText(/\d+ Copper Bar \(Mining 1\)/)).toBeVisible();
});
