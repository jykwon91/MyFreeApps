import { SLOT_LABELS, type ItemSlot } from "@/games/wow-forever/data/itemSlots";
import type { StatValues } from "@/games/wow-forever/data/statKeys";
import { STAT_LINE_RULES } from "@/games/wow-forever/parsing/statLineRules";
import type { WeaponStats } from "@/games/wow-forever/types/compareItem";

/**
 * Deterministic parser for pasted Classic-style item tooltip text.
 *
 * Runs entirely in the browser (no AI, works signed out and in the public
 * deployment). Anything it can't read goes to `unparsedEffects` so the user
 * can see it and add the stat by hand — nothing is silently dropped.
 */
export interface ParsedTooltip {
  name: string;
  slot: ItemSlot | null;
  itemType: string | null;
  armor: number | null;
  weapon: WeaponStats | null;
  stats: StatValues;
  unparsedEffects: string[];
  requiredLevel: number | null;
  setName: string | null;
  warnings: string[];
}

const SLOT_BY_LABEL = new Map<string, ItemSlot>(
  (Object.entries(SLOT_LABELS) as [ItemSlot, string][]).map(([slot, label]) => [label.toLowerCase(), slot]),
);
SLOT_BY_LABEL.set("held in off hand", "held_in_off_hand");
SLOT_BY_LABEL.set("cloak", "back");
SLOT_BY_LABEL.set("ring", "finger");

const IGNORED_LINE =
  /^(binds|unique|soulbound|quest item|durability|classes:|races:|sell price|item level|requires (?!level)|\(.*damage per second\)|"|<|begins a quest|max stack)/i;
const DAMAGE_LINE = /^(\d+)\s*-\s*(\d+)\s+damage\b/i;
const SPEED = /speed\s+(\d+(?:\.\d+)?)/i;
const ARMOR_LINE = /^(\d+)\s+armor$/i;
const REQUIRED_LEVEL = /^requires level (\d+)/i;
const SET_LINE = /^(.+?)\s*\(\d+\/\d+\)$/;
const EFFECT_PREFIX = /^(equip|use|chance on hit|set):/i;
const MAX_UNPARSED = 20;

function matchStat(line: string, stats: StatValues): boolean {
  const body = line.replace(/\.$/, "").trim();
  for (const { stat, pattern } of STAT_LINE_RULES) {
    const m = pattern.exec(body);
    if (!m) continue;
    const raw = m.slice(1).find((g) => g !== undefined);
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    stats[stat] = (stats[stat] ?? 0) + value;
    return true;
  }
  return false;
}

function parseSlotLine(line: string): { slot: ItemSlot; itemType: string | null } | null {
  const [first, ...rest] = line.split(/\t|\s{2,}/).map((s) => s.trim()).filter(Boolean);
  const slot = SLOT_BY_LABEL.get((first ?? "").toLowerCase());
  if (!slot) return null;
  return { slot, itemType: rest.join(" ") || null };
}

export function parseTooltipText(text: string): ParsedTooltip {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const result: ParsedTooltip = {
    name: lines[0] ?? "",
    slot: null,
    itemType: null,
    armor: null,
    weapon: null,
    stats: {},
    unparsedEffects: [],
    requiredLevel: null,
    setName: null,
    warnings: [],
  };
  let damage: { min: number; max: number } | null = null;
  let speed: number | null = null;

  for (const line of lines.slice(1)) {
    const damageMatch = DAMAGE_LINE.exec(line);
    const speedMatch = SPEED.exec(line);
    if (damageMatch || (speedMatch && !EFFECT_PREFIX.test(line))) {
      if (damageMatch) damage = { min: Number(damageMatch[1]), max: Number(damageMatch[2]) };
      if (speedMatch) speed = Number(speedMatch[1]);
      continue;
    }
    const armor = ARMOR_LINE.exec(line);
    if (armor) {
      result.armor = Number(armor[1]);
      continue;
    }
    const level = REQUIRED_LEVEL.exec(line);
    if (level) {
      result.requiredLevel = Number(level[1]);
      continue;
    }
    if (result.slot === null) {
      const slotLine = parseSlotLine(line);
      if (slotLine) {
        result.slot = slotLine.slot;
        result.itemType = slotLine.itemType;
        continue;
      }
    }
    if (IGNORED_LINE.test(line)) continue;
    const setLine = SET_LINE.exec(line);
    if (setLine) {
      result.setName = setLine[1];
      continue;
    }
    if (matchStat(line.replace(EFFECT_PREFIX, "").trim(), result.stats)) continue;
    if (/^[+\d]/.test(line) || EFFECT_PREFIX.test(line)) {
      if (result.unparsedEffects.length < MAX_UNPARSED) result.unparsedEffects.push(line);
    }
  }

  if (damage && speed && speed > 0) {
    result.weapon = { minDamage: damage.min, maxDamage: damage.max, speed };
  } else if (damage) {
    result.warnings.push("Found weapon damage but no speed — add the speed to score weapon DPS.");
  }
  if (!result.name) result.warnings.push("Couldn't find the item name — the first line should be the name.");
  const nothingRead = Object.keys(result.stats).length === 0 && result.armor === null && result.weapon === null;
  if (result.name && nothingRead) {
    result.warnings.push("No stats were found — check the text, or add stats by hand.");
  }
  return result;
}
