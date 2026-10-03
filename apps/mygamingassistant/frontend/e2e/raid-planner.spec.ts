/**
 * The group planner — `/wow-forever/raids/:webId/plan#k=<token>`, opened from [Groups] on a raid's Raid: Edit.
 *
 * No backend: each test routes its plan (`fixtures/raidPlan.ts` — the reads and saves are the fixture, the icons the
 * bot's own files), seats players with the mouse, the keyboard and the Move-to lists, saves, and checks what it sent.
 *
 * Run: npm run test:e2e -- raid-planner
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { PlanAssignment } from "../src/games/wow-forever/types/raidPlan";
import { fulfillJson } from "./fixtures/raidPage";
import {
  PLANNER_AUTHORIZATION,
  PLANNER_HEADING,
  PLANNER_LINK,
  PLANNER_PATH,
  largePlanFixture,
  routePlan,
  smallPlanFixture,
  type PlanRoutes,
} from "./fixtures/raidPlan";

const SITE_TITLE = "MyGamingAssistant";
const LINK_PROBLEM = "Planner link missing or expired";
const SAVED = "Groups saved";
const UNSAVED = "Unsaved changes";
/** Room for the pool and both of the 10-man's groups on one screen. */
const DESKTOP = { width: 1280, height: 1200 };

test.afterEach(async ({ page, context }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await context.unrouteAll({ behavior: "ignoreErrors" });
});

async function openPlanner(page: Page): Promise<void> {
  await page.goto(PLANNER_LINK);
  await expect(page.getByRole("heading", { level: 1, name: PLANNER_HEADING })).toBeVisible();
}

/** Who sits in each of a group's five seats, in order: "" for an empty one. */
function seatsIn(page: Page, group: number): Promise<string[]> {
  return page
    .getByRole("list", { name: `Group ${group}`, exact: true })
    .getByRole("listitem")
    .evaluateAll((seats) =>
      seats.map((seat) => seat.querySelector('span[title]:not([title="Late"])')?.textContent ?? ""),
    );
}

function handle(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

function seat(page: Page, group: number, slot: number): Locator {
  return page
    .getByRole("list", { name: `Group ${group}`, exact: true })
    .getByRole("listitem")
    .nth(slot - 1);
}

function assignment(name: string, group: number, slot: number): PlanAssignment {
  return { signup_id: `signup-${name.toLowerCase()}`, group, slot };
}

/** The 10-man's first groups, as `smallPlanFixture` seats them, then `more`, in the order a save sends them. */
function firstGroupsWith(...more: PlanAssignment[]): PlanAssignment[] {
  const first = [
    assignment("Aldren", 1, 1),
    assignment("Brisa", 1, 2),
    assignment("Cael", 1, 3),
    assignment("Edda", 2, 1),
    assignment("Gwyn", 2, 2),
  ];
  return [...first, ...more].sort((a, b) => a.group - b.group || a.slot - b.slot);
}

async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("not on screen");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Press, move past dnd-kit's 4 px before it lifts, then on to `target` in steps it can follow, and let go. */
async function dragWithMouse(page: Page, from: Locator, target: Locator): Promise<void> {
  const start = await centerOf(from);
  const end = await centerOf(target);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y + 6, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 20 });
  await page.mouse.up();
}

/** Every plan request sent the link's token, and only it. */
function expectOnlyThePlannerToken(routes: PlanRoutes): void {
  expect(routes.authorizations().length).toBeGreaterThan(0);
  expect(new Set(routes.authorizations())).toEqual(new Set([PLANNER_AUTHORIZATION]));
}

test("takes the link's token out of the address bar, sends it rather than a session, and survives a reload", async ({
  page,
}) => {
  // A signed-in tab: the planner still sends its link, never the session's Bearer token.
  await page.addInitScript(() => window.localStorage.setItem("token", "e2e-session-token"));
  const routes = await routePlan(page, smallPlanFixture());
  await openPlanner(page);

  await expect.poll(() => new URL(page.url()).hash).toBe("");
  expect(new URL(page.url()).pathname).toBe(PLANNER_PATH);
  await expect(page).toHaveTitle(`${PLANNER_HEADING} · ${SITE_TITLE}`);
  await expect(page.getByText(/^Link expires in 1 h 59 m$|^Link expires in 2 h$/)).toBeVisible();
  await expect(page.getByText(/10-man \(2 groups\)$/)).toBeVisible();
  expectOnlyThePlannerToken(routes);

  // The token stays with this tab: a reload, with no `#k=` left, still opens the planner.
  const reads = routes.reads();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: PLANNER_HEADING })).toBeVisible();
  expect(routes.reads()).toBeGreaterThan(reads);
  expectOnlyThePlannerToken(routes);
});

test("drags a player into an empty seat with the mouse, and Save sends the groups", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const routes = await routePlan(page, smallPlanFixture());
  await openPlanner(page);
  expect(await seatsIn(page, 1)).toEqual(["Aldren", "Brisa", "Cael", "", ""]);

  await dragWithMouse(page, handle(page, "Fenn, Fury Warrior"), seat(page, 1, 4));
  await expect.poll(() => seatsIn(page, 1)).toEqual(["Aldren", "Brisa", "Cael", "Fenn", ""]);
  await expect(page.getByText(UNSAVED)).toBeVisible();

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(SAVED)).toBeVisible();
  await expect(page.getByText(UNSAVED)).toHaveCount(0);
  expect(routes.saves()).toEqual([
    { version: 3, published: false, assignments: firstGroupsWith(assignment("Fenn", 1, 4)) },
  ]);
  expectOnlyThePlannerToken(routes);
});

test("moves players with the keyboard, saying where they are at each step, and Escape puts one back", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await routePlan(page, smallPlanFixture());
  await openPlanner(page);
  const live = page.locator('[id^="DndLiveRegion"]');

  await handle(page, "Aldren, Protection Warrior").focus();
  await page.keyboard.press("Space");
  // Picked up, then over the seat they're lifted from.
  await expect(live).toHaveText(/^(Picked up Aldren\.|Aldren is over Group 1 slot 1\.)$/);
  await page.keyboard.press("ArrowDown");
  await expect(live).toHaveText("Aldren is over Group 1 slot 2, where Brisa sits.");
  await page.keyboard.press("ArrowDown");
  await expect(live).toHaveText("Aldren is over Group 1 slot 3, where Cael sits.");
  await page.keyboard.press("ArrowDown");
  await expect(live).toHaveText("Aldren is over Group 1 slot 4.");
  await page.keyboard.press("Space");
  await expect(live).toHaveText("Dropped Aldren in Group 1 slot 4.");
  await expect.poll(() => seatsIn(page, 1)).toEqual(["", "Brisa", "Cael", "Aldren", ""]);

  await handle(page, "Brisa, Combat Rogue").focus();
  await page.keyboard.press("Space");
  await expect(live).toHaveText(/^(Picked up Brisa\.|Brisa is over Group 1 slot 2\.)$/);
  await page.keyboard.press("ArrowRight");
  await expect(live).toHaveText("Brisa is over Group 2 slot 2, where Gwyn sits.");
  await page.keyboard.press("Escape");
  await expect(live).toHaveText("Put Brisa back where they were.");
  expect(await seatsIn(page, 1)).toEqual(["", "Brisa", "Cael", "Aldren", ""]);
  expect(await seatsIn(page, 2)).toEqual(["Edda", "Gwyn", "", "", ""]);
});

test("Auto-fill seats a 40-man in its eight groups by role, and Save sends all forty", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 1600 });
  const routes = await routePlan(page, largePlanFixture());
  await openPlanner(page);
  await expect(page.getByText(/40-man \(8 groups\)$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();

  await page.getByRole("button", { name: "Auto-fill" }).click();
  await expect(page.getByText("5/5", { exact: true })).toHaveCount(8);
  await expect(page.getByText("Everyone with a seat is in a group.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Auto-fill" })).toBeDisabled();
  // A tank in each of the first four groups and a healer in every group; melee from the front, ranged from the back.
  const tallies = [
    "T1 H2 M2 R0",
    "T1 H2 M2 R0",
    "T1 H1 M3 R0",
    "T1 H1 M3 R0",
    "T0 H1 M2 R1",
    "T0 H1 M0 R4",
    "T0 H1 M0 R4",
    "T0 H1 M0 R4",
  ];
  for (const [index, tally] of tallies.entries()) {
    await expect(page.getByRole("region", { name: `Group ${index + 1}`, exact: true })).toContainText(tally);
  }
  await page.locator("main").first().evaluate((shell) => shell.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("planner-40-light.png") });

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(SAVED)).toBeVisible();
  const [save] = routes.saves();
  expect(save.version).toBe(1);
  expect(save.assignments).toHaveLength(40);
  expect(new Set(save.assignments.map((placed) => `${placed.group}/${placed.slot}`)).size).toBe(40);
});

test("when someone else saved first, it says so and shows their groups", async ({ page }) => {
  const mine = smallPlanFixture();
  const theirs = {
    ...mine,
    version: 4,
    players: mine.players.map((player) => {
      if (player.name !== "Dara") return player;
      return { ...player, group: 2, slot: 3 };
    }),
  };
  let served = mine;
  const routes = await routePlan(page, mine, {
    read: (route) => fulfillJson(route, 200, served),
    save: (route) => {
      served = theirs;
      return fulfillJson(route, 409, { detail: "groups_changed" });
    },
  });
  await openPlanner(page);

  await page.getByRole("combobox", { name: "Move Fenn to" }).selectOption("slot:1:4");
  await expect.poll(() => seatsIn(page, 1)).toEqual(["Aldren", "Brisa", "Cael", "Fenn", ""]);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Someone else saved the groups — showing their version.")).toBeVisible();
  await expect.poll(() => seatsIn(page, 2)).toEqual(["Edda", "Gwyn", "Dara", "", ""]);
  expect(await seatsIn(page, 1)).toEqual(["Aldren", "Brisa", "Cael", "", ""]);
  await expect(page.getByText(UNSAVED)).toHaveCount(0);
  expect(routes.saves()).toHaveLength(1);
  expect(routes.saves()[0].version).toBe(3);
});

test("a link that runs out while planning: Save, then reopening it, show how to get a new one", async ({ page }) => {
  let expired = false;
  const routes = await routePlan(page, smallPlanFixture(), {
    read: (route) => {
      if (expired) return fulfillJson(route, 403, { detail: "plan_link_expired" });
      return fulfillJson(route, 200, smallPlanFixture());
    },
    save: (route) => {
      expired = true;
      return fulfillJson(route, 403, { detail: "plan_link_expired" });
    },
  });
  await openPlanner(page);
  await page.getByRole("combobox", { name: "Move Fenn to" }).selectOption("slot:1:4");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("heading", { level: 1, name: LINK_PROBLEM })).toBeVisible();
  await expect(page).toHaveTitle(`${LINK_PROBLEM} · ${SITE_TITLE}`);
  await expect(page.getByText(/open Apps → Raid: Edit/)).toBeVisible();
  expect(routes.saves()).toHaveLength(1);

  // Reopened later, the expired link is refused before any groups show.
  const reads = routes.reads();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: LINK_PROBLEM })).toBeVisible();
  expect(routes.reads()).toBeGreaterThan(reads);
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
});

test("with no token at all, it asks for a new link without asking the API", async ({ page }) => {
  const routes = await routePlan(page, smallPlanFixture());
  await page.goto(PLANNER_PATH);
  await expect(page.getByRole("heading", { level: 1, name: LINK_PROBLEM })).toBeVisible();
  expect(routes.reads()).toBe(0);

  await page.getByRole("link", { name: "Go to WoW Forever" }).click();
  await expect(page).toHaveURL(/\/wow-forever$/);
});

test("on a phone it never scrolls sideways, every control is a 44 px tap, and Move-to seats a player", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const routes = await routePlan(page, smallPlanFixture());
  await openPlanner(page);

  // The window, the shell's scrolling <main> and the page's own.
  const overflow = await page.evaluate(() => {
    const mains = Array.from(document.querySelectorAll("main"));
    const inside = Math.max(0, ...mains.map((main) => main.scrollWidth - main.clientWidth));
    return Math.max(document.documentElement.scrollWidth - window.innerWidth, inside);
  });
  expect(overflow).toBeLessThanOrEqual(0);

  const controls = [
    handle(page, "Fenn, Fury Warrior"),
    page.getByRole("combobox", { name: "Move Fenn to" }),
    page.getByRole("button", { name: "Note from Jory" }),
    page.getByRole("button", { name: "Auto-fill" }),
    page.getByRole("switch", { name: "Visible to raiders" }),
    page.getByRole("button", { name: "Save" }),
  ];
  for (const control of controls) {
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }

  // The phone's own picker: here, the select's value.
  await page.getByRole("combobox", { name: "Move Fenn to" }).selectOption("slot:1:4");
  await expect.poll(() => seatsIn(page, 1)).toEqual(["Aldren", "Brisa", "Cael", "Fenn", ""]);
  await page.getByRole("switch", { name: "Visible to raiders" }).click();
  await expect(page.getByRole("switch", { name: "Visible to raiders" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(SAVED)).toBeVisible();
  expect(routes.saves()).toEqual([
    { version: 3, published: true, assignments: firstGroupsWith(assignment("Fenn", 1, 4)) },
  ]);

  // The whole page in one picture, to look at: the app scrolls inside its shell, not the window.
  await page.getByRole("button", { name: "Note from Jory" }).click();
  await page.setViewportSize({ width: 375, height: 3000 });
  await page.locator("main").first().evaluate((shell) => shell.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("planner-375.png") });
});

test.describe("in the dark theme", () => {
  test.use({ colorScheme: "dark" });

  test("follows the system's dark theme", async ({ page }, testInfo) => {
    await page.setViewportSize(DESKTOP);
    await routePlan(page, smallPlanFixture());
    await openPlanner(page);
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);

    await page.getByRole("button", { name: "Note from Jory" }).click();
    await expect(page.getByText("Back from work at 8:15.")).toBeVisible();
    await page.getByRole("combobox", { name: "Move Fenn to" }).selectOption("slot:1:4");
    await expect(page.getByText(UNSAVED)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("planner-dark.png") });
  });
});
