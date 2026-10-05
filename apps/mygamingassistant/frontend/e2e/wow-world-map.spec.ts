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

  await expect(page.getByText(/Say where you are above/)).toBeVisible();
  await page.getByRole("radio", { name: "Alliance" }).click();
  await page.getByLabel("Class").selectOption("warlock");
  await page.getByLabel("Zone").selectOption({ label: "Elwynn Forest" });

  // Stand in Goldshire: the trainer there is the nearest.
  await page.getByRole("combobox", { name: "Where are you?" }).fill("/way 42 65");
  await page.getByRole("button", { name: "Set", exact: true }).click();

  const trainer = page.getByRole("article", { name: "Warlock trainer: Maximillian Crowe" });
  await expect(trainer).toBeVisible();
  await expect(trainer.getByText("Classic location — may differ in Forever")).toBeVisible();

  // The map shows the zone art.
  await expect(page.getByRole("img", { name: "Elwynn Forest map" })).toBeVisible();

  await trainer.getByRole("button", { name: "Directions to Maximillian Crowe" }).click();
  const planner = page.getByRole("region", { name: "Route planner" });
  await expect(planner.getByLabel("From")).toHaveValue("Your location");
  // The walk follows the ground (public/wow-walk/0.walk): into the inn, drawn as its real path.
  const steps = planner.getByRole("list", { name: "Directions" });
  await expect(steps).toContainText(/Walk ~\d+ yd to Maximillian Crowe/);
  await steps.getByText(/Step by step/).click();
  await expect(steps).toContainText("Go inside");
  await expect(page.getByTestId("route-leg-1")).toBeAttached();

  await trainer.getByRole("button", { name: /Show on map/ }).click();
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
  await page.getByRole("combobox", { name: "Where are you?" }).fill("48, 42");
  await page.getByRole("button", { name: "Set", exact: true }).click();

  const quests = page.getByRole("region", { name: "Quests near you" });
  const willem = quests.getByRole("article", { name: "Quest giver: Deputy Willem" });
  await expect(willem.getByRole("list", { name: "Quests from Deputy Willem" })).toContainText("A Threat Within");
  await willem.getByRole("button", { name: "Directions to Deputy Willem" }).click();
  // Standing at the abbey: he's within a few yards.
  await expect(page.getByRole("region", { name: "Route planner" }).getByRole("list", { name: "Directions" })).toContainText("Deputy Willem is right here");

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
  await page.getByRole("combobox", { name: "Where are you?" }).fill("42, 65");
  await page.getByRole("button", { name: "Set", exact: true }).click();

  const trainer = page.getByRole("article", { name: "Warlock trainer: Maximillian Crowe" });
  await expect(trainer.getByText(/^Captured in Forever/)).toBeVisible();
  await expect(trainer.getByText("Classic location — may differ in Forever")).toHaveCount(0);
  await trainer.getByRole("button", { name: /Show on map/ }).click();
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
  await page.getByRole("combobox", { name: "Where are you?" }).fill("42, 65");
  await page.getByRole("button", { name: "Set", exact: true }).click();
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

test("a selected result can be let go of — click again, Clear, Esc or the map — the view goes back, and Reset filters restores the defaults", async ({
  page,
}) => {
  await standInGoldshire(page);
  const crowe = page.getByRole("article", { name: "Warlock trainer: Maximillian Crowe" });
  const name = crowe.getByRole("heading", { name: "Maximillian Crowe" });
  const selectedMarker = page.getByRole("group", { name: "Elwynn Forest markers" }).getByRole("button", { pressed: true });
  const elwynn = page.getByRole("img", { name: "Elwynn Forest map" });
  const resetZoom = page.getByRole("button", { name: "Reset zoom" });
  const map = page.getByTestId("zone-map");

  // Click the selected row again: the highlight goes and the zoom-in on it is undone.
  await name.click();
  await expect(selectedMarker).toHaveAccessibleName(/Maximillian Crowe/);
  await expect(resetZoom).toBeVisible();
  await name.click();
  await expect(crowe).not.toHaveAttribute("aria-current", "true");
  await expect(selectedMarker).toHaveCount(0);
  await expect(elwynn).toBeVisible();
  await expect(resetZoom).toHaveCount(0);

  // The row's Clear button.
  await name.click();
  await crowe.getByRole("button", { name: "Clear selection: Maximillian Crowe" }).click();
  await expect(selectedMarker).toHaveCount(0);
  await expect(resetZoom).toHaveCount(0);

  // A click on the map lets go and doesn't move you; the map is back as it was.
  await name.click();
  await expect(selectedMarker).toHaveAccessibleName(/Maximillian Crowe/);
  await map.click({ position: await mapPoint(page, 20, 20) });
  await expect(selectedMarker).toHaveCount(0);
  await expect(elwynn).toBeVisible();
  await expect(resetZoom).toHaveCount(0);

  // A result in another zone: the map opens Ironforge zoomed in; letting go returns to Elwynn, unzoomed.
  const calder = page.getByRole("region", { name: "Find" }).getByRole("article", { name: "Alexander Calder" });
  await calder.getByRole("heading", { name: "Alexander Calder" }).click();
  await expect(page.getByRole("img", { name: "Ironforge map" })).toBeVisible();
  await expect(page).toHaveURL(/[?&]m=1455/);
  await expect(resetZoom).toBeVisible();
  await calder.getByRole("heading", { name: "Alexander Calder" }).click();
  await expect(calder).not.toHaveAttribute("aria-current", "true");
  await expect(elwynn).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]m=1455/);
  await expect(resetZoom).toHaveCount(0);

  // Reset filters: back to class trainers and the default layers; the selection and its view go; the You section stays.
  const find = page.getByRole("region", { name: "Find" });
  const reset = find.getByRole("button", { name: "Reset filters" });
  await expect(reset).toBeDisabled();
  await find.getByLabel("What are you looking for?").selectOption("flight_master");
  await page.getByRole("checkbox", { name: "Quest givers" }).check();
  await name.click();
  await expect(resetZoom).toBeVisible();
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(find.getByLabel("What are you looking for?")).toHaveValue("class_trainer");
  await expect(page.getByRole("checkbox", { name: "Quest givers" })).not.toBeChecked();
  await expect(reset).toBeDisabled();
  await expect(selectedMarker).toHaveCount(0);
  await expect(resetZoom).toHaveCount(0);
  await expect(page.getByLabel("Zone").locator("option:checked")).toHaveText("Elwynn Forest");

  // Esc on the map: first lets go (the view comes back), then zooms out.
  await name.click();
  await map.focus();
  await page.keyboard.press("Escape");
  await expect(selectedMarker).toHaveCount(0);
  await expect(elwynn).toBeVisible();
  await expect(resetZoom).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("img", { name: "Eastern Kingdoms map" })).toBeVisible();
});

test("a trainer in Ironforge gets directions through the Deeprun Tram", async ({ page }) => {
  await page.goto("/wow-forever/map");
  await page.getByRole("radio", { name: "Alliance" }).click();
  await page.getByLabel("Class").selectOption("warlock");
  await page.getByLabel("Zone").selectOption({ label: "Elwynn Forest" });
  await page.getByRole("combobox", { name: "Where are you?" }).fill("42, 65");
  await page.getByRole("button", { name: "Set", exact: true }).click();

  const find = page.getByRole("region", { name: "Find" });
  await expect(find.getByText("Elsewhere on this continent")).toBeVisible();
  const ironforge = find.getByRole("article", { name: "Alexander Calder" });
  await ironforge.getByRole("button", { name: "Directions to Alexander Calder" }).click();
  const planner = page.getByRole("region", { name: "Route planner" });
  const steps = planner.getByRole("list", { name: "Directions" });
  await expect(steps).toContainText("Take the tram (Stormwind - Ironforge)");
  await expect(planner.getByText(/Boats, zeppelins and the tram run on a loop/)).toBeVisible();
  // Selecting a result switches the map to the destination on demand.
  await page.getByRole("button", { name: "Destination: Ironforge" }).click();
  await expect(page.getByRole("img", { name: "Ironforge map" })).toBeVisible();
});

test("markers keep their size when the map zooms in", async ({ page }) => {
  await standInGoldshire(page);
  const you = page.getByRole("group", { name: "Elwynn Forest markers" }).getByLabel("You", { exact: true });
  const before = (await you.boundingBox())?.width ?? 0;
  expect(before).toBeGreaterThan(0);
  await page.getByRole("article", { name: "Warlock trainer: Maximillian Crowe" }).getByRole("heading", { name: "Maximillian Crowe" }).click();
  await expect(page.getByRole("button", { name: "Reset zoom" })).toBeVisible();
  await expect.poll(async () => Math.abs(((await you.boundingBox())?.width ?? 0) - before)).toBeLessThan(2);
});

test("a capital drawn on its zone's map opens on a click", async ({ page }) => {
  await page.goto("/wow-forever/map?m=1426");
  const map = page.getByTestId("zone-map");
  await expect(page.getByRole("img", { name: "Dun Morogh map" })).toBeVisible();
  // Ironforge sits at about 59, 29 on the Dun Morogh map.
  await map.click({ position: await mapPoint(page, 59.1, 29.1) });
  await expect(page.getByRole("img", { name: "Ironforge map" })).toBeVisible();

  // Stormwind sits at about 20, 27 on the Elwynn Forest map.
  await page.goto("/wow-forever/map?m=1429");
  await expect(page.getByRole("img", { name: "Elwynn Forest map" })).toBeVisible();
  await map.click({ position: await mapPoint(page, 19.6, 27.5) });
  await expect(page.getByRole("img", { name: "Stormwind City map" })).toBeVisible();
});

test("an Alliance walker in Darkshore reaches Desolace by Stonetalon, not through Horde ground", async ({ page }) => {
  // Only Auberdine's flight path known: no flight helps, so the planner walks.
  await page.addInitScript(() => {
    localStorage.setItem(
      "mga.wowForever.worldMap.player.v1",
      JSON.stringify({ faction: "A", classId: "warlock", zoneId: 1439, level: 26, position: { x: 36.8, y: 44.6 } }),
    );
    localStorage.setItem("mga.wowForever.worldMap.travel.v1", JSON.stringify({ flights: "known", knownFlightIds: [26] }));
  });
  await page.goto("/wow-forever/map?to=pt%3A1443%2C71.7%2C59.4&dir=1&m=1442");

  const planner = page.getByRole("region", { name: "Route planner" });
  await expect(planner).toContainText("keep clear of the other faction's towns");
  const steps = planner.getByRole("list", { name: "Directions" });
  await expect(steps).toContainText(/Walk ~[\d,]+ yd to Desolace/);
  await steps.getByText(/Step by step/).click();
  await expect(steps).toContainText("The Talondeep Path");
  await expect(steps).toContainText("The Charred Vale");
  await expect(steps).not.toContainText("Mulgore");
  await expect(steps).not.toContainText("The Barrens");
});
