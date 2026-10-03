/**
 * A posted raid as `GET /api/wow/raids/{web_id}` returns it, and the routes that serve it — the raid page's specs
 * (`raid-web.spec.ts`, `serve-only-raid.spec.ts`) run with no backend. The read is this fixture; the icons and the
 * banner are the bot's own files (`backend/data/`), so the page shows the art its Discord post does.
 *
 * The raid: a 40-man Molten Core, full — 40 seats (2 of them late) and 2 in the queue — with someone in every
 * column, "No class yet" included, and on each of Tentative, Bench and Absence.
 */
import { readFileSync } from "node:fs";
import type { Page, Route } from "@playwright/test";
import type { RaidEntry, RaidPage } from "../../src/games/wow-forever/types/raid";

export const RAID_WEB_ID = "6f1c2b0e9d8a4c7b8e5f3a2d1c0b9a87";
export const RAID_PATH = `/wow-forever/raids/${RAID_WEB_ID}`;
export const RAID_TITLE = "Friday Molten Core";
export const DISCORD_URL = "https://discord.com/channels/100000000000000001/100000000000000002/100000000000000003";

const ICONS_DIR = new URL("../../../backend/data/discord_emojis/", import.meta.url);
const BANNERS_DIR = new URL("../../../backend/data/raid_banners/", import.meta.url);

const SECOND_MS = 1_000;
const DAY_MS = 86_400 * SECOND_MS;
const SIZE_CAP = 40;

type Spec = readonly [wowClass: string, spec: string, icon: string, role: NonNullable<RaidEntry["role_group"]>];

const PROT_WARRIOR: Spec = ["warrior", "Protection Warrior", "warrior_protection", "tank"];
const FERAL_TANK: Spec = ["druid", "Feral Druid (tank)", "druid_feral_tank", "tank"];
const FURY: Spec = ["warrior", "Fury Warrior", "warrior_fury", "melee"];
const ARMS: Spec = ["warrior", "Arms Warrior", "warrior_arms", "melee"];
const RESTO_DRUID: Spec = ["druid", "Restoration Druid", "druid_restoration", "healer"];
const BALANCE: Spec = ["druid", "Balance Druid", "druid_balance", "ranged"];
const HOLY_PALADIN: Spec = ["paladin", "Holy Paladin", "paladin_holy", "healer"];
const RETRIBUTION: Spec = ["paladin", "Retribution Paladin", "paladin_retribution", "melee"];
const COMBAT: Spec = ["rogue", "Combat Rogue", "rogue_combat", "melee"];
const ASSASSINATION: Spec = ["rogue", "Assassination Rogue", "rogue_assassination", "melee"];
const MARKSMANSHIP: Spec = ["hunter", "Marksmanship Hunter", "hunter_marksmanship", "ranged"];
const SURVIVAL: Spec = ["hunter", "Survival Hunter", "hunter_survival", "ranged"];
const FROST: Spec = ["mage", "Frost Mage", "mage_frost", "ranged"];
const FIRE: Spec = ["mage", "Fire Mage", "mage_fire", "ranged"];
const DESTRUCTION: Spec = ["warlock", "Destruction Warlock", "warlock_destruction", "ranged"];
const AFFLICTION: Spec = ["warlock", "Affliction Warlock", "warlock_affliction", "ranged"];
const HOLY_PRIEST: Spec = ["priest", "Holy Priest", "priest_holy", "healer"];
const SHADOW: Spec = ["priest", "Shadow Priest", "priest_shadow", "ranged"];
const RESTO_SHAMAN: Spec = ["shaman", "Restoration Shaman", "shaman_restoration", "healer"];
const ENHANCEMENT: Spec = ["shaman", "Enhancement Shaman", "shaman_enhancement", "melee"];

interface Seat {
  name: string;
  spec: Spec | null;
  late?: boolean;
  queued?: boolean;
}

type Column = readonly [key: string, label: string, icon: string | null, limit: number | null, players: Seat[]];

/** The post's columns, in its order (`raid_catalog.POST_COLUMNS`, then "No class yet"). */
const LINE_UP: readonly Column[] = [
  ["tank", "Tanks", "role_tank", 4, [
    { name: "Aldren", spec: PROT_WARRIOR },
    { name: "Brannoc", spec: PROT_WARRIOR },
    { name: "Cyra", spec: FERAL_TANK },
  ]],
  ["warrior", "Warrior", "warrior", null, [
    { name: "Dorn", spec: FURY, late: true },
    { name: "Elwyn", spec: FURY },
    { name: "Fenna", spec: FURY },
    { name: "Garrick", spec: ARMS },
    { name: "Torvald", spec: FURY, queued: true },
  ]],
  ["druid", "Druid", "druid", null, [
    { name: "Hollis", spec: RESTO_DRUID },
    { name: "Isolde", spec: RESTO_DRUID },
    { name: "Jorund", spec: BALANCE },
  ]],
  ["paladin", "Paladin", "paladin", null, [
    { name: "Kesta", spec: HOLY_PALADIN },
    { name: "Lorcan", spec: HOLY_PALADIN },
    { name: "Mirela", spec: HOLY_PALADIN },
    { name: "Nyx", spec: RETRIBUTION },
  ]],
  ["rogue", "Rogue", "rogue", null, [
    { name: "Orrin", spec: COMBAT },
    { name: "Perrin", spec: COMBAT },
    { name: "Shadowstepperextraordinaire", spec: COMBAT },
    { name: "Rowan", spec: COMBAT },
    { name: "Sable", spec: ASSASSINATION },
  ]],
  ["hunter", "Hunter", "hunter", null, [
    { name: "Hesper", spec: MARKSMANSHIP, late: true },
    { name: "Ulla", spec: MARKSMANSHIP },
    { name: "Varek", spec: MARKSMANSHIP },
    { name: "Wren", spec: SURVIVAL },
  ]],
  ["mage", "Mage", "mage", 6, [
    { name: "Xandra", spec: FROST },
    { name: "Yorick", spec: FROST },
    { name: "Zephra", spec: FROST },
    { name: "Ash", spec: FROST },
    { name: "Corvin", spec: FIRE },
    { name: "Daska", spec: FIRE },
  ]],
  ["warlock", "Warlock", "warlock", null, [
    { name: "Ember", spec: DESTRUCTION },
    { name: "Fiora", spec: DESTRUCTION },
    { name: "Gideon", spec: DESTRUCTION },
    { name: "Ilya", spec: AFFLICTION },
  ]],
  ["priest", "Priest", "priest", null, [
    { name: "Jasper", spec: HOLY_PRIEST },
    { name: "Lyra", spec: HOLY_PRIEST },
    { name: "Maelis", spec: HOLY_PRIEST },
    { name: "Norrin", spec: HOLY_PRIEST },
    { name: "Oswin", spec: SHADOW },
  ]],
  ["shaman", "Shaman", "shaman", null, [
    { name: "Quinlan", spec: RESTO_SHAMAN },
    { name: "Rhea", spec: ENHANCEMENT },
  ]],
  ["none", "No class yet", null, null, [{ name: "Newcomer", spec: null, queued: true }]],
];

function toEntry(seat: Seat, id: string, number: number | null): RaidEntry {
  return {
    id,
    number,
    name: seat.name,
    wow_class: seat.spec?.[0] ?? null,
    spec: seat.spec?.[1] ?? null,
    icon: seat.spec?.[2] ?? null,
    role_group: seat.spec?.[3] ?? null,
    late: seat.late ?? false,
    queued: seat.queued ?? false,
  };
}

/** Order numbers: the 40 seats in a sign-up order spread across the columns, then the queue. */
function numbered(): Map<string, number> {
  const seats = LINE_UP.flatMap(([, , , , players]) => players).filter((seat) => !seat.queued);
  const numbers = new Map<string, number>();
  seats.forEach((seat, index) => numbers.set(seat.name, ((index * 17) % seats.length) + 1));
  LINE_UP.flatMap(([, , , , players]) => players)
    .filter((seat) => seat.queued)
    .forEach((seat, index) => numbers.set(seat.name, seats.length + index + 1));
  return numbers;
}

function unixIso(unix: number): string {
  return new Date(unix * SECOND_MS).toISOString();
}

/** The raid, starting three days from now unless `overrides` say otherwise. */
export function raidFixture(overrides: Partial<RaidPage> = {}): RaidPage {
  const startsAt = Math.floor((Date.now() + 3 * DAY_MS) / SECOND_MS);
  const numbers = numbered();
  const columns = LINE_UP.map(([key, label, icon, limit, players]) => {
    const entries = players
      .map((seat) => toEntry(seat, `seat-${seat.name}`, numbers.get(seat.name) ?? null))
      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
    return { key, label, icon, count: entries.length, limit, entries };
  });
  return {
    web_id: RAID_WEB_ID,
    title: RAID_TITLE,
    raid_key: "mc",
    raid_name: "Molten Core",
    leader_name: "Aldren",
    starts_at: unixIso(startsAt),
    closes_at: unixIso(startsAt - 2 * 3_600),
    state: "open",
    cancel_reason: null,
    size_cap: SIZE_CAP,
    seats_taken: 40,
    late: 2,
    queued: 2,
    color: "#e67e22",
    banner_url: "/api/discord/raid-banners/mc.png?v=e2e",
    discord_url: DISCORD_URL,
    description: [
      { kind: "text", text: "Full clear, Ragnaros included. Bring fire resistance.\nInvites at " },
      { kind: "time", unix: startsAt - 900, style: "t" },
      { kind: "text", text: ", first pull " },
      { kind: "time", unix: startsAt, style: "R" },
      { kind: "text", text: ".\nQuestions? Ask " },
      { kind: "mention", text: "@Raid Leads" },
      { kind: "text", text: " in " },
      { kind: "mention", text: "#raid-chat" },
      { kind: "text", text: ". Soft-reserve one item each." },
    ],
    roles: [
      { role: "tank", label: "Tanks", icon: "role_tank", count: 3, limit: 4 },
      { role: "melee", label: "Melee", icon: "role_melee", count: 11, limit: null },
      { role: "ranged", label: "Ranged", icon: "role_ranged", count: 16, limit: null },
      { role: "healer", label: "Healers", icon: "role_healer", count: 10, limit: 10 },
    ],
    columns,
    lists: [
      {
        status: "tentative",
        label: "Tentative",
        icon: "status_tentative",
        entries: [
          toEntry({ name: "Pell", spec: FROST }, "list-pell", null),
          toEntry({ name: "Soren", spec: null }, "list-soren", null),
        ],
      },
      {
        status: "bench",
        label: "Bench",
        icon: "status_bench",
        entries: [toEntry({ name: "Tamsin", spec: HOLY_PRIEST }, "list-tamsin", null)],
      },
      {
        status: "absence",
        label: "Absence",
        icon: "status_absence",
        entries: [toEntry({ name: "Brisa", spec: COMBAT }, "list-brisa", null)],
      },
    ],
    icons_version: "e2e",
    ...overrides,
  };
}

/** Nobody signed up yet. */
export function emptyRaidFixture(): RaidPage {
  const raid = raidFixture();
  return {
    ...raid,
    seats_taken: 0,
    late: 0,
    queued: 0,
    roles: raid.roles.map((role) => ({ ...role, count: 0 })),
    columns: [],
    lists: [],
  };
}

export function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: "application/json", json: body });
}

export interface RaidRoutes {
  /** How many times the page has read the raid. */
  reads: () => number;
}

/**
 * Answer the raid read with `respond` (told which read this is, from 1), serve the bot's icons and banners from
 * disk, and 404 anything else under `/api/` so no test depends on a backend.
 */
export async function routeRaid(
  page: Page,
  respond: (route: Route, read: number) => Promise<void>,
): Promise<RaidRoutes> {
  let reads = 0;
  // Registered first, so it only answers what the routes below don't.
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => fulfillJson(route, 404, { detail: "Not Found" }),
  );
  await page.route(
    (url) => url.pathname.startsWith("/api/discord/raid-icons/"),
    (route) => servePng(route, ICONS_DIR),
  );
  await page.route(
    (url) => url.pathname.startsWith("/api/discord/raid-banners/"),
    (route) => servePng(route, BANNERS_DIR),
  );
  await page.route(
    (url) => url.pathname.startsWith("/api/wow/raids/"),
    (route) => {
      reads += 1;
      return respond(route, reads);
    },
  );
  return { reads: () => reads };
}

async function servePng(route: Route, dir: URL): Promise<void> {
  const name = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "");
  let body: Buffer;
  try {
    body = readFileSync(new URL(name, dir));
  } catch {
    await route.fulfill({ status: 404, body: "" });
    return;
  }
  await route.fulfill({ status: 200, contentType: "image/png", body });
}
