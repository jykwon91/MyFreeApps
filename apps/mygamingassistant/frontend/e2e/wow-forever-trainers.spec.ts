/**
 * WoW Forever trainers — picking a class or profession, the level ladder folding at your level, your
 * faction's trainers, the phone layout and the loading skeleton.
 *
 * Run: npx playwright test --config e2e/playwright.config.ts wow-forever-trainers
 */
import { test, expect, type Page } from "@playwright/test";

const TRAINERS = "/wow-forever/trainers";
const MIN_TARGET_PX = 44;

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("the picker opens a class; a wrong slug says so", async ({ page }) => {
  await page.goto(TRAINERS);
  await expect(page.getByRole("heading", { level: 1, name: "Trainers" })).toBeVisible();
  await page.getByTestId("trainers-picker").getByRole("link", { name: "Mage" }).click();
  await expect(page).toHaveURL(new RegExp(`${TRAINERS}/mage$`));
  await expect(page.getByRole("heading", { level: 1, name: "Mage trainers" })).toBeVisible();
  await expect(page).toHaveTitle(/Mage trainers/);
  await expect(page.getByTestId("trainers-level").first()).toBeVisible();

  await page.goto(`${TRAINERS}/bard`);
  await expect(page.getByText('There\'s no class or profession called "bard"')).toBeVisible();
});

test("your level folds the levels below it and marks the next; faction picks the trainers", async ({ page }) => {
  await page.goto(`${TRAINERS}/warlock`);
  const levels = page.getByTestId("trainers-level");
  await expect(levels.first()).toBeVisible();
  const all = await levels.count();

  await page.getByLabel("Your level").fill("20");
  await expect(levels.first()).toContainText("Next");
  const ahead = await levels.count();
  expect(ahead).toBeLessThan(all);
  await page.getByRole("button", { name: /below yours/ }).click();
  await expect(levels).toHaveCount(all);

  await page.getByRole("radio", { name: "Horde" }).click();
  const list = page.getByRole("list", { name: "Warlock trainers" });
  await expect(list).toContainText("Orgrimmar");
  await expect(list).not.toContainText("Stormwind");
  await expect(page.getByRole("heading", { level: 3, name: "Demon trainers" })).toBeVisible();

  await page.getByRole("radio", { name: "Alliance" }).click();
  await expect(list).not.toContainText("Orgrimmar");
});

test("a profession lists its ranks, its trainers and links to its guide", async ({ page }) => {
  await page.goto(`${TRAINERS}/tailoring`);
  await expect(page.getByTestId("trainers-rank")).toHaveCount(4);
  await expect(page.getByTestId("trainers-rank").nth(3)).toContainText("Artisan");
  await expect(page.getByRole("list", { name: "Tailoring trainers", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Tailoring guide/ }).click();
  await expect(page).toHaveURL(/\/wow-forever\/professions\?p=tailoring/);
});

test("phones: no sideways scroll and full-size targets", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${TRAINERS}/hunter`);
  await expect(page.getByTestId("trainers-level").first()).toBeVisible();
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  const targets = [
    page.getByLabel("Your level"),
    page.getByTestId("trainers-picker").getByRole("link", { name: "Hunter" }),
    page.getByRole("link", { name: "Spell details and costs" }),
  ];
  for (const target of targets) {
    const box = await target.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  }
});

test("the skeleton shows while the class loads", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/data\/spellbook\/.*\.json/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(`${TRAINERS}/priest`);
  await expect(page.getByTestId("trainers-skeleton")).toBeVisible();
  release();
  await expect(page.getByTestId("trainers-skeleton")).toHaveCount(0);
  await expect(page.getByTestId("trainers-level").first()).toBeVisible();
});
