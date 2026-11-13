import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import type { WowClass } from "@/games/wow-forever/data/classes";
import { CLASS_PROFICIENCIES } from "@/games/wow-forever/data/gear/classProficiencies";
import { LOOT_ADDON_TALENT_TABS } from "@/games/wow-forever/data/lootAddon/lootAddonTalentTabs";
import { luaString } from "@/games/wow-forever/lib/auctionHouse/luaString";
import { LEVELING_WEIGHTS } from "@/games/wow-forever/data/weights/levelingWeights";
import { PAWN_CLASSIC_WEIGHTS } from "@/games/wow-forever/data/weights/pawnClassicWeights";
import type { StatWeights } from "@/games/wow-forever/data/weights/statWeights";

const luaList = (items: readonly string[]): string => `{${items.map(luaString).join(", ")}}`;

function weightsLua(w: StatWeights): string {
  const stats = Object.entries(w.stats)
    .filter(([, weight]) => weight !== undefined && weight !== 0)
    .sort(([a], [b]) => Number(a > b) - Number(a < b))
    .map(([key, weight]) => `${key} = ${weight}`)
    .join(", ");
  return `{melee = ${w.meleeWeaponDps}, ranged = ${w.rangedWeaponDps}, armor = ${w.armor}, stats = {${stats}}}`;
}

function classLua(wowClass: WowClass): string[] {
  const classId = wowClass.id;
  const p = CLASS_PROFICIENCIES[classId];
  const heavy = p.heavyArmor ? `{type = ${luaString(p.heavyArmor.type)}, level = ${p.heavyArmor.level}}` : "nil";
  const specs = wowClass.specs.map((s) => {
    const key = `${classId}/${s.id}`;
    const pawn = PAWN_CLASSIC_WEIGHTS[key];
    const tab = LOOT_ADDON_TALENT_TABS[key];
    if (!pawn || !tab) throw new Error(`MGA Loot needs Pawn weights and a talent tab for ${key}`);
    return `      {id = ${luaString(s.id)}, name = ${luaString(s.name)}, tab = ${tab}, weights = ${weightsLua(pawn)}},`;
  });
  return [
    `  ${classId} = {`,
    `    leveling = ${weightsLua(LEVELING_WEIGHTS[classId])},`,
    `    armor = ${luaList(p.armor)}, heavy = ${heavy},`,
    `    oneHand = ${luaList(p.oneHand)},`,
    `    twoHand = ${luaList(p.twoHand)},`,
    `    ranged = ${luaList(p.ranged)},`,
    `    shield = ${p.shield}, dualWield = ${p.dualWieldLevel ?? "nil"},`,
    "    specs = {",
    ...specs,
    "    },",
    "  },",
  ];
}

/**
 * MGA Loot's `Data.lua`: per class, the leveling weights, each spec's Pawn
 * Classic level-60 weights and talent tab, and what the class can equip — the
 * same tables Item compare scores with. `addon/MGALoot/Data.lua` is this text,
 * kept in step by a file snapshot test (`npx vitest run -u` rewrites it).
 */
export function lootAddonDataLua(): string {
  return [
    "-- Generated from MyGamingAssistant's Item compare weights and class proficiencies.",
    "-- Do not edit: run `npx vitest run src/__tests__/wowLootAddon.test.ts -u` from apps/mygamingassistant/frontend.",
    "MGALootData = {",
    ...WOW_CLASSES.flatMap(classLua),
    "}",
    "",
  ].join("\n");
}
