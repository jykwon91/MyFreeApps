import type { ClassPick } from "@/games/wow-forever/data/guide/guideTypes";

/**
 * Class overview for new players. Descriptions are how the classes play in
 * Classic Era; Forever is reworking talents, so details may shift.
 */
export const CLASS_PICKS: readonly ClassPick[] = [
  {
    classId: "mage",
    roles: "Ranged damage",
    summary: "Glass-cannon caster with strong area damage, crowd control and teleports.",
    beginnerReason:
      "Conjures its own food and water, so there's almost no downtime, and Frost's slows make fights forgiving while you learn.",
  },
  {
    classId: "paladin",
    roles: "Healer, tank, melee damage",
    summary: "Plate-armored holy warrior with heals, auras and blessings for the group.",
    beginnerReason:
      "Plate armor plus self-heals make it very hard to die, the rotation is simple, and every group wants your buffs.",
  },
  {
    classId: "warrior",
    roles: "Tank, melee damage",
    summary: "The classic tank and a top damage dealer with great gear — but slow and gear-hungry while leveling.",
    beginnerReason: null,
  },
  {
    classId: "hunter",
    roles: "Ranged damage",
    summary: "Fights at range with a pet that tanks for you. Very easy early; mastering it takes longer.",
    beginnerReason: null,
  },
  {
    classId: "rogue",
    roles: "Melee damage",
    summary: "Stealthy melee damage with stuns and poisons. Strong in PvP, needs careful play in PvE.",
    beginnerReason: null,
  },
  {
    classId: "priest",
    roles: "Healer, ranged damage (Shadow)",
    summary: "The strongest pure healer, with a Shadow spec for damage. Always in demand for dungeons.",
    beginnerReason: null,
  },
  {
    classId: "warlock",
    roles: "Ranged damage",
    summary: "Damage-over-time caster with demon pets, fears and a class mount at level 40 (in Classic Era).",
    beginnerReason: null,
  },
  {
    classId: "druid",
    roles: "Healer, tank, melee or ranged damage",
    summary: "Shapeshifter that can fill every role, with travel forms that make leveling smooth.",
    beginnerReason: null,
  },
  {
    classId: "shaman",
    roles: "Healer, melee or ranged damage",
    summary: "Totem-dropping hybrid with heals, shocks and big melee burst in Enhancement.",
    beginnerReason: null,
  },
];
