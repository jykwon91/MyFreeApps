/**
 * The group planner's test data (`wowRaid*.test.ts(x)`): a 10-man raid's plan — two groups of five — with half its
 * players seated. `renderRaidPlanner.tsx` shows it on the planner page.
 */
import { DISPLAY_ROLE, RAID_STATE } from "@/games/wow-forever/data/raidPage";
import { PLANNER_TOKEN_STORAGE_PREFIX } from "@/games/wow-forever/data/raidPlanner";
import type { DisplayRole } from "@/games/wow-forever/types/raid";
import type { PlanPlayer, RaidPlan, SlotRef } from "@/games/wow-forever/types/raidPlan";

export const WEB_ID = "6f1c2b0e9d8a4c7b8e5f3a2d1c0b9a87";
export const PLANNER_PATH = `/wow-forever/raids/${WEB_ID}/plan`;
/** 43 characters, as `raid_plan_links.mint` makes them. */
export const TOKEN = "test-planner-token".padEnd(43, "x");
export const STORAGE_KEY = PLANNER_TOKEN_STORAGE_PREFIX + WEB_ID;
export const TITLE = "Friday Molten Core";
export const JORY_NOTE = "Back from work at 8:15.";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

type Spec = readonly [wowClass: string, spec: string, icon: string, role: DisplayRole];

const PROT_WARRIOR: Spec = ["warrior", "Protection Warrior", "warrior_protection", DISPLAY_ROLE.TANK];
const FERAL_TANK: Spec = ["druid", "Feral Druid (tank)", "druid_feral_tank", DISPLAY_ROLE.TANK];
const COMBAT: Spec = ["rogue", "Combat Rogue", "rogue_combat", DISPLAY_ROLE.MELEE];
const FURY: Spec = ["warrior", "Fury Warrior", "warrior_fury", DISPLAY_ROLE.MELEE];
const HOLY_PRIEST: Spec = ["priest", "Holy Priest", "priest_holy", DISPLAY_ROLE.HEALER];
const RESTO_SHAMAN: Spec = ["shaman", "Restoration Shaman", "shaman_restoration", DISPLAY_ROLE.HEALER];
const FROST: Spec = ["mage", "Frost Mage", "mage_frost", DISPLAY_ROLE.RANGED];
const MARKSMANSHIP: Spec = ["hunter", "Marksmanship Hunter", "hunter_marksmanship", DISPLAY_ROLE.RANGED];
const DESTRUCTION: Spec = ["warlock", "Destruction Warlock", "warlock_destruction", DISPLAY_ROLE.RANGED];

/** A seated player in no group: `p-<name>`, with no class unless the fields give one. */
export function planPlayer(fields: Partial<PlanPlayer> & Pick<PlanPlayer, "name" | "number">): PlanPlayer {
  return {
    id: idOf(fields.name),
    wow_class: null,
    spec: null,
    icon: null,
    role_group: null,
    late: false,
    note: null,
    group: null,
    slot: null,
    ...fields,
  };
}

function specced(number: number, name: string, spec: Spec, fields: Partial<PlanPlayer> = {}): PlanPlayer {
  const [wowClass, specName, icon, role] = spec;
  return planPlayer({ number, name, wow_class: wowClass, spec: specName, icon, role_group: role, ...fields });
}

/** The ten seated players, in line order: 2 tanks, 2 healers, 2 melee, 3 ranged — Jory late, with a note — and Isla. */
export const PLAYERS: readonly PlanPlayer[] = [
  specced(1, "Aldren", PROT_WARRIOR),
  specced(2, "Brisa", COMBAT),
  specced(3, "Cael", HOLY_PRIEST),
  specced(4, "Dara", FROST),
  specced(5, "Edda", FERAL_TANK),
  specced(6, "Fenn", FURY),
  specced(7, "Gwyn", RESTO_SHAMAN),
  specced(8, "Hale", MARKSMANSHIP),
  planPlayer({ number: 9, name: "Isla" }),
  specced(10, "Jory", DESTRUCTION, { late: true, note: JORY_NOTE }),
];

/** As first read: Group 1 Aldren, Brisa, Cael; Group 2 Edda, Gwyn; the other five in no group. */
export const FIRST_SEATS: Readonly<Record<string, SlotRef>> = {
  Aldren: { group: 1, slot: 1 },
  Brisa: { group: 1, slot: 2 },
  Cael: { group: 1, slot: 3 },
  Edda: { group: 2, slot: 1 },
  Gwyn: { group: 2, slot: 2 },
};

export function idOf(name: string): string {
  return `p-${name.toLowerCase()}`;
}

/** The ten, seated by name; anyone not named is in no group. */
export function seated(seats: Readonly<Record<string, SlotRef>>): PlanPlayer[] {
  return PLAYERS.map((player) => ({
    ...player,
    group: seats[player.name]?.group ?? null,
    slot: seats[player.name]?.slot ?? null,
  }));
}

/** The plan as first read, its link good for two hours. */
export function plan(fields: Partial<RaidPlan> = {}): RaidPlan {
  return {
    web_id: WEB_ID,
    title: TITLE,
    starts_at: "2026-10-09T20:00:00.000Z",
    state: RAID_STATE.OPEN,
    size_cap: 10,
    group_count: 2,
    version: 3,
    published: false,
    updated_at: null,
    // Half a minute over two hours: "Link expires in 2 h" for the whole test.
    link_expires_at: new Date(Date.now() + 2 * HOUR_MS + 30_000).toISOString(),
    notes_enabled: true,
    icons_version: "v1",
    players: seated(FIRST_SEATS),
    ...fields,
  };
}

/** `plan()` as someone else saved it meanwhile: Dara joined Group 2. */
export function theirPlan(): RaidPlan {
  return plan({ version: 4, players: seated({ ...FIRST_SEATS, Dara: { group: 2, slot: 3 } }) });
}

/** A link that stops working `ms` from now. */
export function expiringIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}
