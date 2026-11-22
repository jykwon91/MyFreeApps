import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import type { WowClass } from "@/games/wow-forever/data/classes";
import { CLASS_PROFICIENCIES } from "@/games/wow-forever/data/gear/classProficiencies";
import { LOOT_ADDON_TALENT_TABS } from "@/games/wow-forever/data/lootAddon/lootAddonTalentTabs";
import { luaString } from "@/games/wow-forever/lib/auctionHouse/luaString";
import { LEVELING_WEIGHTS } from "@/games/wow-forever/data/weights/levelingWeights";
import { PAWN_CLASSIC_WEIGHTS } from "@/games/wow-forever/data/weights/pawnClassicWeights";
import type { StatWeights } from "@/games/wow-forever/data/weights/statWeights";
import creatureTypeShare from "@/games/wow-forever/data/lootAddon/creatureTypeShare.json";
import itemEffects from "@/games/wow-forever/data/lootAddon/itemEffects.json";
import type { ItemBudgetTable } from "@/games/wow-forever/types/lootAddon/itemBudgetTable";
import type { ItemEffectEntry } from "@/games/wow-forever/types/lootAddon/itemEffectEntry";

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

/** `MGALootCreatureShare[band][TYPE]`: the share of mobs in each ten-level band of each creature type. */
function creatureShareLua(): string[] {
  const bands = Object.entries(creatureTypeShare.bands).sort(([a], [b]) => Number(a) - Number(b));
  const top = Math.max(...bands.map(([band]) => Number(band)));
  return [
    "MGALootCreatureShare = {",
    ...bands.map(([band, shares]) => {
      const list = Object.entries(shares).map(([kind, share]) => `${kind} = ${share}`).join(", ");
      return `  [${band}] = {${list}},`;
    }),
    "}",
    `MGALootCreatureShareTop = ${top}`,
  ];
}

/** `MGALootMobArmor[band]`: the median armor of normal mobs in each ten-level band, for armor cuts. */
function mobArmorLua(): string[] {
  const bands = Object.entries(itemEffects.mobArmor as Record<string, number>).sort(([a], [b]) => Number(a) - Number(b));
  const top = Math.max(...bands.map(([band]) => Number(band)));
  return [
    `MGALootMobArmor = {${bands.map(([band, armor]) => `[${band}] = ${armor}`).join(", ")}}`,
    `MGALootMobArmorTop = ${top}`,
  ];
}

/**
 * `MGALootBudget[group][quality][itemLevel]`: the median stat points of items with no effect, for valuing an
 * effect nothing else can (`backend/scripts/wow_loot/budget.py`).
 */
function budgetLua(): string[] {
  const byNumber = ([a]: [string, unknown], [b]: [string, unknown]): number => Number(a) - Number(b);
  const groups = Object.entries(itemEffects.budget as ItemBudgetTable).sort(([a], [b]) => a.localeCompare(b));
  const levels = groups.flatMap(([, byQuality]) => Object.values(byQuality).flatMap((l) => Object.keys(l).map(Number)));
  return [
    "MGALootBudget = {",
    ...groups.map(([group, byQuality]) => {
      const qualities = Object.entries(byQuality)
        .sort(byNumber)
        .map(([quality, points]) => {
          const rows = Object.entries(points).sort(byNumber);
          // A Lua list: item level N is entry N, so the levels must run 1, 2, 3, ... with no gap.
          if (rows.some(([level], i) => Number(level) !== i + 1)) throw new Error(`budget ${group} ${quality} has a level gap`);
          const list = rows.map(([, n]) => n);
          return `[${quality}] = {${list.join(", ")}}`;
        });
      return `  ${group} = {${qualities.join(", ")}},`;
    }),
    "}",
    `MGALootBudgetTop = ${Math.max(...levels)}`,
  ];
}

// WoW's fonts have no arrow glyph, so the notes' "→" reads "=" in game.
const ARROW = /→/g;

/**
 * `MGALootEffects[itemId]`: what each item's Use, Chance on hit and Equip effects are worth
 * (`stat` = a weight key, or "dps" / "use_dps" / "spell_dps" / "dps_pct" / "armor_cut" / "ranged_*" / "none" / "unresolved" / "budget" = stat points the item lacks for its level), from `itemEffects.json`.
 */
function itemEffectsLua(): string[] {
  const items = Object.entries(itemEffects.items as Record<string, readonly ItemEffectEntry[]>)
    .sort(([a], [b]) => Number(a) - Number(b));
  return [
    "MGALootEffects = {",
    ...items.map(([id, entries]) => {
      const list = entries
        .map((e) => {
          const pvp = e.pvp ? ", pvp = true" : "";
          const forClass = e.class ? `, class = ${luaString(e.class)}` : "";
          return `{stat = ${luaString(e.stat)}, value = ${e.value}, note = ${luaString(e.note.replace(ARROW, "="))}${pvp}${forClass}}`;
        })
        .join(", ");
      return `  [${id}] = {${list}},`;
    }),
    "}",
  ];
}

/**
 * MGA Loot's `Data.lua`: per class, the leveling weights, each spec's Pawn
 * Classic level-60 weights and talent tab, and what the class can equip — the
 * same tables Item compare scores with — and the creature-type shares it counts "vs Humanoids" stats at. `addon/MGALoot/Data.lua` is this text,
 * kept in step by a file snapshot test (`npx vitest run -u` rewrites it).
 */
export function lootAddonDataLua(): string {
  return [
    "-- Generated from MyGamingAssistant's Item compare weights and class proficiencies.",
    "-- Do not edit: run `npx vitest run src/__tests__/wowLootAddon.test.ts -u` from apps/mygamingassistant/frontend.",
    "MGALootData = {",
    ...WOW_CLASSES.flatMap(classLua),
    "}",
    ...creatureShareLua(),
    ...mobArmorLua(),
    ...budgetLua(),
    ...itemEffectsLua(),
    "",
  ].join("\n");
}
