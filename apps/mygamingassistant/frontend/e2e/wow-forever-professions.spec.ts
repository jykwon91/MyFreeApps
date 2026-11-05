/**
 * WoW Forever Professions guide (Cooking, Fishing, Tailoring, Enchanting, Alchemy, Blacksmithing) — static, frontend-only page.
 *
 * Run: npm run test:e2e -- wow-forever-professions
 */
import { test, expect } from "@playwright/test";

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
  for (const p of ["tailoring", "enchanting", "alchemy", "blacksmithing"]) {
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
  await expect(crafting.getByRole("radio")).toHaveText(["Alchemy", "Blacksmithing", "Enchanting", "Tailoring"]);
  await expect(page.getByText(/You can learn two crafting professions \(Classic rule\)/)).toBeVisible();

  await secondary.getByRole("radio", { name: "Fishing" }).click();
  await expect(page).toHaveURL(/\?p=fishing$/);
  await expect(crafting.getByRole("radio", { checked: true })).toHaveCount(0);
});

test("an unknown profession link opens Cooking", async ({ page }) => {
  await page.goto("/wow-forever/professions?p=jewelcrafting");
  await expect(page.getByRole("radio", { name: "Cooking" })).toBeChecked();
});

test("the crafting picker is one row of big targets on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/wow-forever/professions?p=alchemy");
  const radios = page.getByRole("radiogroup", { name: "Crafting professions" }).getByRole("radio");
  await expect(radios).toHaveCount(4);
  const boxes = await Promise.all((await radios.all()).map((r) => r.boundingBox()));
  for (const box of boxes) expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(new Set(boxes.map((b) => Math.round(b?.y ?? 0))).size).toBe(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
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
  // No typed prices for Alchemy: no prices panel, no "cheapest" claim, no gold anywhere.
  await expect(page.getByRole("region", { name: "Your prices" })).toHaveCount(0);
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
  await page.route(/crafting\/(alchemy|blacksmithing|tailoring)\.json/, async (route) => {
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

  // No prices anywhere; bars are smelted from ore.
  await expect(page.getByRole("region", { name: "Your prices" })).toHaveCount(0);
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
