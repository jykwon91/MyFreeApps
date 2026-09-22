/**
 * The nine Classic classes and their Classic talent specs.
 *
 * These ids are the stable key for every class/spec-shaped feature: stat
 * weights (weights/*.ts), the item compare settings, and a future Best-in-Slot
 * page. Never rename an id — persisted settings and data tables key off it.
 */

export type WowClassId =
  | "druid"
  | "hunter"
  | "mage"
  | "paladin"
  | "priest"
  | "rogue"
  | "shaman"
  | "warlock"
  | "warrior";

/** How a spec deals its damage/healing — drives which hit cap and weapon DPS apply. */
export type SpecRole = "melee" | "ranged" | "caster" | "healer" | "tank";

/** Sentinel spec: "I'm leveling, any spec" — uses the class leveling heuristic. */
export const LEVELING_SPEC_ID = "leveling";

export interface WowSpec {
  /** Unique within its class, e.g. "arms". */
  id: string;
  name: string;
  role: SpecRole;
}

export interface WowClass {
  id: WowClassId;
  name: string;
  /** Role used when the spec is "Leveling (any)". */
  levelingRole: SpecRole;
  specs: readonly WowSpec[];
}

export const WOW_CLASSES: readonly WowClass[] = [
  {
    id: "druid",
    name: "Druid",
    levelingRole: "melee",
    specs: [
      { id: "balance", name: "Balance", role: "caster" },
      { id: "feral-damage", name: "Feral (damage)", role: "melee" },
      { id: "feral-tank", name: "Feral (tank)", role: "tank" },
      { id: "restoration", name: "Restoration", role: "healer" },
    ],
  },
  {
    id: "hunter",
    name: "Hunter",
    levelingRole: "ranged",
    specs: [
      { id: "beast-mastery", name: "Beast Mastery", role: "ranged" },
      { id: "marksmanship", name: "Marksmanship", role: "ranged" },
      { id: "survival", name: "Survival", role: "ranged" },
    ],
  },
  {
    id: "mage",
    name: "Mage",
    levelingRole: "caster",
    specs: [
      { id: "arcane", name: "Arcane", role: "caster" },
      { id: "fire", name: "Fire", role: "caster" },
      { id: "frost", name: "Frost", role: "caster" },
    ],
  },
  {
    id: "paladin",
    name: "Paladin",
    levelingRole: "melee",
    specs: [
      { id: "holy", name: "Holy", role: "healer" },
      { id: "protection", name: "Protection", role: "tank" },
      { id: "retribution", name: "Retribution", role: "melee" },
    ],
  },
  {
    id: "priest",
    name: "Priest",
    levelingRole: "caster",
    specs: [
      { id: "discipline", name: "Discipline", role: "healer" },
      { id: "holy", name: "Holy", role: "healer" },
      { id: "shadow", name: "Shadow", role: "caster" },
    ],
  },
  {
    id: "rogue",
    name: "Rogue",
    levelingRole: "melee",
    specs: [
      { id: "assassination", name: "Assassination", role: "melee" },
      { id: "combat", name: "Combat", role: "melee" },
      { id: "subtlety", name: "Subtlety", role: "melee" },
    ],
  },
  {
    id: "shaman",
    name: "Shaman",
    levelingRole: "melee",
    specs: [
      { id: "elemental", name: "Elemental", role: "caster" },
      { id: "enhancement", name: "Enhancement", role: "melee" },
      { id: "restoration", name: "Restoration", role: "healer" },
    ],
  },
  {
    id: "warlock",
    name: "Warlock",
    levelingRole: "caster",
    specs: [
      { id: "affliction", name: "Affliction", role: "caster" },
      { id: "demonology", name: "Demonology", role: "caster" },
      { id: "destruction", name: "Destruction", role: "caster" },
    ],
  },
  {
    id: "warrior",
    name: "Warrior",
    levelingRole: "melee",
    specs: [
      { id: "arms", name: "Arms", role: "melee" },
      { id: "fury", name: "Fury", role: "melee" },
      { id: "protection", name: "Protection", role: "tank" },
    ],
  },
];

export function findClass(classId: string): WowClass | undefined {
  return WOW_CLASSES.find((c) => c.id === classId);
}

export function findSpec(classId: string, specId: string): WowSpec | undefined {
  return findClass(classId)?.specs.find((s) => s.id === specId);
}

/** Role for a class/spec pair; "Leveling (any)" falls back to the class leveling role. */
export function roleFor(classId: WowClassId, specId: string): SpecRole {
  const cls = findClass(classId);
  const spec = findSpec(classId, specId);
  if (spec) return spec.role;
  return cls?.levelingRole ?? "melee";
}
