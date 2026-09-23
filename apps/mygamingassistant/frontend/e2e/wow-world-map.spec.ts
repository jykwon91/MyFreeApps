/**
 * WoW Forever World Map — pick who/where you are, find the nearest Warlock
 * trainer, open directions and copy an in-game waypoint.
 *
 * Frontend-only (static data + map art), so nothing is seeded or stubbed.
 *
 * Run: npm run test:e2e -- wow-world-map
 */
import { test, expect } from "@playwright/test";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("an Alliance Warlock in Elwynn finds a trainer, gets directions and copies a waypoint", async ({ page }) => {
  await page.goto("/wow-forever/map");

  await expect(page.getByText(/Pick your zone above/)).toBeVisible();
  await page.getByRole("radio", { name: "Alliance" }).click();
  await page.getByLabel("Class").selectOption("warlock");
  await page.getByLabel("Zone").selectOption({ label: "Elwynn Forest" });

  // Stand in Goldshire: the trainer there is the nearest.
  await page.getByLabel(/Your coordinates/).fill("/way 42 65");
  await page.getByRole("button", { name: "Set position" }).click();

  const trainer = page.getByRole("article", { name: "Warlock trainer: Maximillian Crowe" });
  await expect(trainer).toBeVisible();
  await expect(trainer.getByText("Classic location — may differ in Forever")).toBeVisible();

  // The map shows the zone art.
  await expect(page.getByRole("img", { name: "Elwynn Forest map" })).toBeVisible();

  await trainer.getByRole("button", { name: /Directions/ }).click();
  await expect(trainer.getByRole("list", { name: "Directions" })).toContainText(/Head .* to Maximillian Crowe/);

  await trainer.getByRole("button", { name: "Copy in-game waypoint" }).first().click();
  await expect(trainer.getByText("Copied").first()).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe("/mga way 1429 44.4 66.2 Maximillian Crowe");

  // Choices survive a reload.
  await page.reload();
  await expect(page.getByRole("article", { name: "Warlock trainer: Maximillian Crowe" })).toBeVisible();
});

test("a level 1 Warlock sees Northshire's quests and the nearby dungeons", async ({ page }) => {
  await page.goto("/wow-forever/map");
  await page.getByRole("radio", { name: "Alliance" }).click();
  await page.getByLabel("Class").selectOption("warlock");
  await page.getByLabel("Zone").selectOption({ label: "Elwynn Forest" });
  await page.getByLabel("Level").fill("1");
  await page.getByLabel(/Your coordinates/).fill("48, 42");
  await page.getByRole("button", { name: "Set position" }).click();

  const quests = page.getByRole("region", { name: "Quests near you" });
  const willem = quests.getByRole("article", { name: "Quest giver: Deputy Willem" });
  await expect(willem.getByRole("list", { name: "Quests from Deputy Willem" })).toContainText("A Threat Within");
  await willem.getByRole("button", { name: /Directions/ }).click();
  // Standing at the abbey: he's within a few yards.
  await expect(willem.getByRole("list", { name: "Directions" })).toContainText("Deputy Willem is right here");

  const dungeons = page.getByRole("region", { name: "Dungeons & raids" });
  await expect(dungeons.getByRole("article", { name: "Dungeon: Stormwind Stockade" })).toContainText("too low to enter yet");

  // The dungeon layer is on by default; quest givers can be switched on.
  await page.getByLabel("Quest givers").check();
  await expect(page.getByRole("group", { name: "Elwynn Forest markers" })).toBeVisible();
});

test("a far-away trainer gets flight directions with the discovery caveat", async ({ page }) => {
  await page.goto("/wow-forever/map");
  await page.getByRole("radio", { name: "Alliance" }).click();
  await page.getByLabel("Class").selectOption("warlock");
  await page.getByLabel("Zone").selectOption({ label: "Elwynn Forest" });
  await page.getByLabel(/Your coordinates/).fill("42, 65");
  await page.getByRole("button", { name: "Set position" }).click();

  const find = page.getByRole("region", { name: "Find" });
  await expect(find.getByText("Elsewhere on this continent")).toBeVisible();
  const ironforge = find.getByRole("article", { name: "Alexander Calder" });
  await ironforge.getByRole("button", { name: /Directions/ }).click();
  const steps = ironforge.getByRole("list", { name: "Directions" });
  await expect(steps).toContainText("Fly from Stormwind, Elwynn to Ironforge, Dun Morogh");
  await expect(ironforge.getByText(/Flight paths must be discovered first/)).toBeVisible();
  // Selecting a result switches the map to the destination on demand.
  await page.getByRole("button", { name: "Destination: Ironforge" }).click();
  await expect(page.getByRole("img", { name: "Ironforge map" })).toBeVisible();
});
