/**
 * A raid's plan as `GET /api/wow/raids/{web_id}/plan` returns it to the leader's planner link, and the routes that
 * serve it and take its saves — the planner's specs (`raid-planner.spec.ts`, `serve-only-raid-planner.spec.ts`) run
 * with no backend. The icons are the bot's own files (`fixtures/raidPage.ts`).
 *
 * Two raids: a 10-man with half its players seated in its two groups, and a 40-man with nobody in a group yet.
 */
import type { Page, Route } from "@playwright/test";
import type { PlanPlayer, RaidPlan, RaidPlanSave, RaidPlanSaved } from "../../src/games/wow-forever/types/raidPlan";
import { RAID_TITLE, RAID_WEB_ID, fulfillJson, routeRaidArt } from "./raidPage";

/** 43 characters, as `raid_plan_links.mint` makes them. */
export const PLANNER_TOKEN = "e2e-planner-token".padEnd(43, "x");
export const PLANNER_PATH = `/wow-forever/raids/${RAID_WEB_ID}/plan`;
/** What [Groups] on Raid: Edit gives the leader. */
export const PLANNER_LINK = `${PLANNER_PATH}#k=${PLANNER_TOKEN}`;
export const PLANNER_AUTHORIZATION = `RaidPlanner ${PLANNER_TOKEN}`;
export const PLANNER_HEADING = `Groups — ${RAID_TITLE}`;

const SECOND_MS = 1_000;
const HOUR_MS = 3_600 * SECOND_MS;
const DAY_MS = 24 * HOUR_MS;

type Spec = readonly [wowClass: string, spec: string, icon: string, role: NonNullable<PlanPlayer["role_group"]>];

const PROT_WARRIOR: Spec = ["warrior", "Protection Warrior", "warrior_protection", "tank"];
const FERAL_TANK: Spec = ["druid", "Feral Druid (tank)", "druid_feral_tank", "tank"];
const FURY: Spec = ["warrior", "Fury Warrior", "warrior_fury", "melee"];
const COMBAT: Spec = ["rogue", "Combat Rogue", "rogue_combat", "melee"];
const RETRIBUTION: Spec = ["paladin", "Retribution Paladin", "paladin_retribution", "melee"];
const ENHANCEMENT: Spec = ["shaman", "Enhancement Shaman", "shaman_enhancement", "melee"];
const HOLY_PRIEST: Spec = ["priest", "Holy Priest", "priest_holy", "healer"];
const HOLY_PALADIN: Spec = ["paladin", "Holy Paladin", "paladin_holy", "healer"];
const RESTO_DRUID: Spec = ["druid", "Restoration Druid", "druid_restoration", "healer"];
const RESTO_SHAMAN: Spec = ["shaman", "Restoration Shaman", "shaman_restoration", "healer"];
const FROST: Spec = ["mage", "Frost Mage", "mage_frost", "ranged"];
const MARKSMANSHIP: Spec = ["hunter", "Marksmanship Hunter", "hunter_marksmanship", "ranged"];
const DESTRUCTION: Spec = ["warlock", "Destruction Warlock", "warlock_destruction", "ranged"];
const SHADOW: Spec = ["priest", "Shadow Priest", "priest_shadow", "ranged"];

type Seat = readonly [name: string, spec: Spec | null];

/** The 10-man's line, in order — one name long enough to truncate — seated as `SMALL_SEATS` says. */
const SMALL_LINE: readonly Seat[] = [
  ["Aldren", PROT_WARRIOR],
  ["Brisa", COMBAT],
  ["Cael", HOLY_PRIEST],
  ["Dara", FROST],
  ["Edda", FERAL_TANK],
  ["Fenn", FURY],
  ["Gwyn", RESTO_SHAMAN],
  ["Halewynshadowmoonwhisper", MARKSMANSHIP],
  ["Isla", null],
  ["Jory", DESTRUCTION],
];

const SMALL_SEATS: Readonly<Record<string, readonly [group: number, slot: number]>> = {
  Aldren: [1, 1],
  Brisa: [1, 2],
  Cael: [1, 3],
  Edda: [2, 1],
  Gwyn: [2, 2],
};

/** The 40-man's line: 4 tanks, 10 healers, 12 melee, 13 ranged and one with no class yet. */
const LARGE_LINE: readonly Seat[] = [
  ...seats(["Aldren", "Brannoc", "Dagny"], PROT_WARRIOR),
  ...seats(["Cyra"], FERAL_TANK),
  ...seats(["Jasper", "Lyra", "Maelis", "Norrin"], HOLY_PRIEST),
  ...seats(["Kesta", "Lorcan", "Mirela"], HOLY_PALADIN),
  ...seats(["Hollis", "Isolde"], RESTO_DRUID),
  ...seats(["Quinlan"], RESTO_SHAMAN),
  ...seats(["Dorn", "Elwyn", "Fenna", "Torvald"], FURY),
  ...seats(["Orrin", "Perrin", "Rowan", "Sable"], COMBAT),
  ...seats(["Nyx", "Ulric"], RETRIBUTION),
  ...seats(["Rhea", "Tamsin"], ENHANCEMENT),
  ...seats(["Xandra", "Yorick", "Zephra", "Ash"], FROST),
  ...seats(["Hesper", "Ulla", "Varek", "Wren"], MARKSMANSHIP),
  ...seats(["Ember", "Fiora", "Gideon"], DESTRUCTION),
  ...seats(["Oswin", "Pell"], SHADOW),
  ["Newcomer", null],
];

function seats(names: readonly string[], spec: Spec): Seat[] {
  return names.map((name) => [name, spec]);
}

function toPlayer([name, spec]: Seat, index: number): PlanPlayer {
  return {
    id: `signup-${name.toLowerCase()}`,
    name,
    wow_class: spec?.[0] ?? null,
    spec: spec?.[1] ?? null,
    icon: spec?.[2] ?? null,
    role_group: spec?.[3] ?? null,
    number: index + 1,
    late: false,
    note: null,
    group: null,
    slot: null,
  };
}

function seated(player: PlanPlayer): PlanPlayer {
  const seat = SMALL_SEATS[player.name];
  if (seat === undefined) return player;
  return { ...player, group: seat[0], slot: seat[1] };
}

/** The 10-man: Group 1 Aldren, Brisa, Cael; Group 2 Edda, Gwyn; Jory late, with a note. Good for two hours. */
export function smallPlanFixture(overrides: Partial<RaidPlan> = {}): RaidPlan {
  const players = SMALL_LINE.map(toPlayer).map(seated);
  const jory = players.length - 1;
  players[jory] = { ...players[jory], late: true, note: "Back from work at 8:15." };
  return {
    web_id: RAID_WEB_ID,
    title: RAID_TITLE,
    starts_at: new Date(Date.now() + 3 * DAY_MS).toISOString(),
    state: "open",
    size_cap: 10,
    group_count: 2,
    version: 3,
    published: false,
    updated_at: null,
    link_expires_at: new Date(Date.now() + 2 * HOUR_MS).toISOString(),
    notes_enabled: true,
    icons_version: "e2e",
    players,
    ...overrides,
  };
}

/** The 40-man, nobody in a group yet. */
export function largePlanFixture(): RaidPlan {
  return smallPlanFixture({ size_cap: 40, group_count: 8, version: 1, players: LARGE_LINE.map(toPlayer) });
}

/** What the API answers a save of `body` to `plan` with: the groups as sent, a version on. */
export function savedPlan(plan: RaidPlan, body: RaidPlanSave): RaidPlanSaved {
  const seatsById = new Map(body.assignments.map((assignment) => [assignment.signup_id, assignment]));
  const players = plan.players.map((player) => ({
    ...player,
    group: seatsById.get(player.id)?.group ?? null,
    slot: seatsById.get(player.id)?.slot ?? null,
  }));
  const saved = { ...plan, version: plan.version + 1, published: body.published, updated_at: new Date().toISOString() };
  return { plan: { ...saved, players }, dropped: [] };
}

export interface PlanRoutes {
  /** How many times the planner has read the plan. */
  reads: () => number;
  /** What each save sent, in order. */
  saves: () => RaidPlanSave[];
  /** Each plan request's `Authorization`, in order. */
  authorizations: () => (string | null)[];
}

export interface PlanResponders {
  /** Answers the n-th read (from 1) instead of the plan as last saved. */
  read?: (route: Route, read: number) => Promise<void>;
  /** Answers the n-th save (from 1) instead of saving it. */
  save?: (route: Route, save: number) => Promise<void>;
}

/**
 * Serve `plan` to the planner and save what it sends — unless `respond` answers a read or a save itself — with the
 * bot's icons from disk and a 404 for anything else under `/api/`.
 */
export async function routePlan(page: Page, plan: RaidPlan, respond: PlanResponders = {}): Promise<PlanRoutes> {
  let current = plan;
  let reads = 0;
  const saves: RaidPlanSave[] = [];
  const authorizations: (string | null)[] = [];
  await routeRaidArt(page);
  await page.route(
    (url) => url.pathname === `/api/wow/raids/${plan.web_id}/plan`,
    async (route) => {
      const request = route.request();
      authorizations.push(await request.headerValue("authorization"));
      if (request.method() === "PUT") {
        const body = request.postDataJSON() as RaidPlanSave;
        saves.push(body);
        if (respond.save) return respond.save(route, saves.length);
        const saved = savedPlan(current, body);
        current = saved.plan;
        return fulfillJson(route, 200, saved);
      }
      reads += 1;
      if (respond.read) return respond.read(route, reads);
      return fulfillJson(route, 200, current);
    },
  );
  return { reads: () => reads, saves: () => saves, authorizations: () => authorizations };
}
