/**
 * WoW Forever World Map — pick who/where you are, find the nearest Warlock
 * trainer, open directions and copy an in-game waypoint.
 *
 * Frontend-only (static data + map art), so nothing is seeded or stubbed.
 *
 * Run: npm run test:e2e -- wow-world-map
 */
import { test, expect, type Page } from "@playwright/test";

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

test("a location captured in Forever replaces the Classic spot and the waypoint follows it", async ({ page }) => {
  // The capture API is the only backend call; answer it like a server with one capture.
  await page.route("**/api/wow/map-captures", (route) =>
    route.fulfill({
      json: {
        captures: [
          {
            capture_key: "npc:906:service",
            kind: "service",
            subkind: "class_trainer",
            tag: "warlock",
            npc_id: 906,
            name: "Maximillian Crowe",
            title: "Warlock Trainer",
            zone_id: 1429,
            subzone: "Goldshire",
            x: 43.1,
            y: 65.5,
            faction: "A",
            quests: null,
            captured_at: "2026-09-20T18:00:00Z",
          },
        ],
      },
    }),
  );
  await page.goto("/wow-forever/map");
  await page.getByRole("radio", { name: "Alliance" }).click();
  await page.getByLabel("Class").selectOption("warlock");
  await page.getByLabel("Zone").selectOption({ label: "Elwynn Forest" });
  await page.getByLabel(/Your coordinates/).fill("42, 65");
  await page.getByRole("button", { name: "Set position" }).click();

  const trainer = page.getByRole("article", { name: "Warlock trainer: Maximillian Crowe" });
  await expect(trainer.getByText(/^Captured in Forever/)).toBeVisible();
  await expect(trainer.getByText("Classic location — may differ in Forever")).toHaveCount(0);
  await trainer.getByRole("button", { name: "Copy in-game waypoint" }).first().click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe("/mga way 1429 43.1 65.5 Maximillian Crowe");
});

/** Hover / click the map at map percent (x, y) — the map isn't zoomed, so its box is the picture's. */
async function mapPoint(page: Page, x: number, y: number) {
  const box = await page.getByTestId("zone-map").boundingBox();
  if (!box) throw new Error("the map isn't on screen");
  return { x: (box.width * x) / 100, y: (box.height * y) / 100 };
}

/** The neighbour labels overlap neither each other nor the map picture (where the markers are). */
async function expectLabelsClear(page: Page) {
  const labels = page.getByTestId("map-edge-frame").getByRole("button", { name: /^Go to / });
  await expect(labels.first()).toBeVisible();
  const picture = await page.getByTestId("zone-map").boundingBox();
  const boxes = await labels.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { name: el.getAttribute("aria-label"), x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  if (!picture) throw new Error("the map isn't on screen");
  const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (const [i, a] of boxes.entries()) {
    expect(overlap(a, picture), `${a.name} covers the map`).toBe(false);
    for (const b of boxes.slice(i + 1)) expect(overlap(a, b), `${a.name} / ${b.name}`).toBe(false);
  }
}

async function standInGoldshire(page: Page) {
  // The capture API is the only backend call; answer it like a server with none.
  await page.route("**/api/wow/map-captures", (route) => route.fulfill({ json: { captures: [] } }));
  await page.goto("/wow-forever/map");
  await page.getByRole("radio", { name: "Alliance" }).click();
  await page.getByLabel("Class").selectOption("warlock");
  await page.getByLabel("Zone").selectOption({ label: "Elwynn Forest" });
  await page.getByLabel(/Your coordinates/).fill("42, 65");
  await page.getByRole("button", { name: "Set position" }).click();
  await expect(page.getByRole("img", { name: "Elwynn Forest map" })).toBeVisible();
}

test("the map zooms out to the continent, opens zones, crosses borders and goes back", async ({ page }) => {
  await standInGoldshire(page);
  const map = page.getByTestId("zone-map");

  // Elwynn's neighbours are named in the band around the map, where each one is.
  await expect(page.getByRole("button", { name: "Go to Redridge Mountains" })).toHaveText("Redridge Mountains →");
  await expectLabelsClear(page);

  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(page.getByRole("img", { name: "Eastern Kingdoms map" })).toBeVisible();
  await expect(page).toHaveURL(/[?&]m=1415/);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Azeroth");

  // Westfall's middle on the continent map (generated bounds: Westfall (45, 50) -> EK (41.4, 76.8)).
  await map.hover({ position: await mapPoint(page, 41.4, 76.8) });
  await expect(page.getByText(/Westfall · Level \d+–\d+ · Alliance territory — click to go there/)).toBeVisible();
  await expect(page.getByTestId("map-hover-highlight")).toBeVisible();
  await map.click({ position: await mapPoint(page, 41.4, 76.8) });
  await expect(page.getByRole("img", { name: "Westfall map" })).toBeVisible();
  await expect(page).toHaveURL(/[?&]m=1436/);

  // Westfall's map shows a corner of Elwynn: clicking it crosses the border.
  await map.hover({ position: await mapPoint(page, 88, 12) });
  await expect(page.getByText(/Elwynn Forest · .* — click to go there/)).toBeVisible();
  await map.click({ position: await mapPoint(page, 88, 12) });
  await expect(page.getByRole("img", { name: "Elwynn Forest map" })).toBeVisible();

  // Browsing never moved you: your saved zone and position are unchanged.
  const stored = await page.evaluate(() => window.localStorage.getItem("mga.wowForever.worldMap.player.v1"));
  expect(JSON.parse(stored ?? "{}")).toMatchObject({ zoneId: 1429, position: { x: 42, y: 65 } });

  // Browser back is zoom-out history: Westfall, then the continent.
  await page.goBack();
  await expect(page.getByRole("img", { name: "Westfall map" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("img", { name: "Eastern Kingdoms map" })).toBeVisible();

  // Right-click zooms out too.
  await map.click({ button: "right", position: await mapPoint(page, 50, 50) });
  await expect(page.getByRole("img", { name: "Azeroth map" })).toBeVisible();
});

test("clicking a result in the list shows it on its map, highlighted", async ({ page }) => {
  await standInGoldshire(page);
  const find = page.getByRole("region", { name: "Find" });
  const calder = find.getByRole("article", { name: "Alexander Calder" });
  await calder.getByRole("heading", { name: "Alexander Calder" }).click();

  await expect(page.getByRole("img", { name: "Ironforge map" })).toBeVisible();
  await expect(page).toHaveURL(/[?&]m=1455/);
  const marker = page.getByRole("group", { name: "Ironforge markers" }).getByRole("button", { pressed: true });
  await expect(marker).toHaveAccessibleName(/Alexander Calder/);
  await expect(calder).toHaveAttribute("aria-current", "true");

  // Enter on a focused row does the same.
  const crowe = page.getByRole("article", { name: "Warlock trainer: Maximillian Crowe" });
  await crowe.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("img", { name: "Elwynn Forest map" })).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Elwynn Forest markers" }).getByRole("button", { pressed: true }),
  ).toHaveAccessibleName(/Maximillian Crowe/);
});

test("Stranglethorn names only the zones it borders, without labels piling up", async ({ page }) => {
  await page.route("**/api/wow/map-captures", (route) => route.fulfill({ json: { captures: [] } }));
  await page.goto("/wow-forever/map?m=1434");
  await expect(page.getByRole("img", { name: "Stranglethorn Vale map" })).toBeVisible();
  const frame = page.getByTestId("map-edge-frame");
  for (const name of ["Westfall", "Duskwood", "Deadwind Pass", "Blasted Lands"]) {
    await expect(frame.getByRole("button", { name: `Go to ${name}` })).toBeVisible();
  }
  await expect(frame.getByRole("button", { name: "Go to Swamp of Sorrows" })).toHaveCount(0);
  await expectLabelsClear(page);
});

test("on the stacked layout a chosen result scrolls the map into view", async ({ page }) => {
  await page.setViewportSize({ width: 930, height: 800 });
  await standInGoldshire(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const crowe = page.getByRole("article", { name: "Warlock trainer: Maximillian Crowe" });
  await crowe.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("group", { name: "Elwynn Forest markers" }).getByRole("button", { pressed: true }),
  ).toHaveAccessibleName(/Maximillian Crowe/);
  await expect(page.getByTestId("zone-map")).toBeInViewport({ ratio: 0.9 });
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
