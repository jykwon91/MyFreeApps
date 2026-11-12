import {
  CHARACTER_STATS_CLASS_TAB,
  CHARACTER_STATS_DEFAULT_TAB,
  CHARACTER_STATS_TABS,
  MANA_POWER_TYPE,
  NORMAL_MOVEMENT_SPEED,
} from "@/games/wow-forever/data/character/characterStatsConfig";
import { characterClassId } from "@/games/wow-forever/lib/character/characterClassId";
import type { CharacterStatLine } from "@/games/wow-forever/types/character/characterStatLine";
import type { CharacterStats } from "@/games/wow-forever/types/character/characterStats";
import type { CharacterStatsTab } from "@/games/wow-forever/types/character/characterStatsTab";
import type { CharacterStatValue } from "@/games/wow-forever/types/character/characterStatValue";
import type { CharacterWeaponDamage } from "@/games/wow-forever/types/character/characterWeaponDamage";

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatWhole(value: number): string {
  return whole.format(value);
}

/** 4.9312 → "4.93%". */
export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

/** 54.2–81.7 → "54 – 82". */
export function formatDamageRange(damage: CharacterWeaponDamage): string {
  return `${Math.round(damage.min)} – ${Math.round(damage.max)}`;
}

function line(label: string, value: string, bonus: string | null = null): CharacterStatLine {
  return { label, value, bonus };
}

/** What gear, talents and buffs add on top of the base value, or null when nothing does. */
export function statBonus(stat: CharacterStatValue): string | null {
  const added = stat.effective - stat.base;
  if (added === 0) return null;
  return `${added > 0 ? "+" : "−"}${formatWhole(Math.abs(added))}`;
}

function valueLine(label: string, stat: CharacterStatValue): CharacterStatLine {
  return line(label, formatWhole(stat.effective), statBonus(stat));
}

function weaponLines(label: string, damage: CharacterWeaponDamage | null): CharacterStatLine[] {
  if (damage === null) return [];
  const lines = [line(`${label} damage`, formatDamageRange(damage))];
  if (damage.speed !== null) lines.push(line(`${label} speed`, damage.speed.toFixed(2)));
  if (damage.dps !== null) lines.push(line(`${label} DPS`, damage.dps.toFixed(1)));
  return lines;
}

/** A line only when the stat does something — haste and expertise are 0 for most Classic characters. */
function nonZero(label: string, value: number, format: (v: number) => string): CharacterStatLine[] {
  return value === 0 ? [] : [line(label, format(value))];
}

/** Strength through Spirit, with what gear adds. */
export function attributeLines(stats: CharacterStats): CharacterStatLine[] {
  return [
    valueLine("Strength", stats.strength),
    valueLine("Agility", stats.agility),
    valueLine("Stamina", stats.stamina),
    valueLine("Intellect", stats.intellect),
    valueLine("Spirit", stats.spirit),
  ];
}

/** The always-shown summary: health, power, and run speed when it isn't normal (armor lives in Defenses). */
export function summaryLines(stats: CharacterStats): CharacterStatLine[] {
  const lines = [line("Health", formatWhole(stats.health)), line(stats.power_type, formatWhole(stats.power))];
  if (stats.movement_speed !== NORMAL_MOVEMENT_SPEED) {
    lines.push(line("Run speed", `${formatWhole(stats.movement_speed)}%`));
  }
  return lines;
}

function meleeLines(stats: CharacterStats): CharacterStatLine[] {
  const melee = stats.melee;
  return [
    ...weaponLines("Main hand", melee.main_hand),
    ...weaponLines("Off hand", melee.off_hand),
    line("Attack power", formatWhole(melee.attack_power)),
    line("Crit chance", formatPercent(melee.crit)),
    line("Hit chance", formatPercent(melee.hit)),
    ...nonZero("Haste", melee.haste, formatPercent),
    ...nonZero("Expertise", melee.expertise, formatWhole),
  ];
}

function rangedLines(stats: CharacterStats): CharacterStatLine[] {
  const ranged = stats.ranged;
  return [
    ...weaponLines("Ranged", ranged.damage),
    line("Attack power", formatWhole(ranged.attack_power)),
    line("Crit chance", formatPercent(ranged.crit)),
    line("Hit chance", formatPercent(ranged.hit)),
    ...nonZero("Haste", ranged.haste, formatPercent),
  ];
}

function manaRegenLines(stats: CharacterStats): CharacterStatLine[] {
  if (stats.power_type !== MANA_POWER_TYPE) return [];
  return [
    line("Mana regen (per 5 sec)", formatWhole(stats.spell.mana_regen)),
    line("Mana regen while casting", formatWhole(stats.spell.mana_regen_casting)),
  ];
}

function spellLines(stats: CharacterStats): CharacterStatLine[] {
  const spell = stats.spell;
  return [
    line("Spell damage", formatWhole(spell.power)),
    line("Healing", formatWhole(spell.healing)),
    line("Crit chance", formatPercent(spell.crit)),
    line("Hit chance", formatPercent(spell.hit)),
    ...nonZero("Haste", spell.haste, formatPercent),
    ...nonZero("Spell penetration", spell.penetration, formatWhole),
    ...manaRegenLines(stats),
  ];
}

function defenseLines(stats: CharacterStats): CharacterStatLine[] {
  const defenses = stats.defenses;
  return [
    valueLine("Armor", defenses.armor),
    valueLine("Defense", defenses.defense),
    line("Dodge", formatPercent(defenses.dodge)),
    line("Parry", formatPercent(defenses.parry)),
    line("Block", formatPercent(defenses.block)),
  ];
}

const TAB_LINES: Readonly<Record<CharacterStatsTab, (stats: CharacterStats) => CharacterStatLine[]>> = {
  melee: meleeLines,
  ranged: rangedLines,
  spell: spellLines,
  defenses: defenseLines,
};

export function tabLines(stats: CharacterStats, tab: CharacterStatsTab): CharacterStatLine[] {
  return TAB_LINES[tab](stats);
}

/** The tab a class looks at first: casters Spell, hunters Ranged, everyone else Melee. */
export function defaultStatsTab(className: string): CharacterStatsTab {
  const classId = characterClassId(className);
  if (classId === undefined) return CHARACTER_STATS_DEFAULT_TAB;
  return CHARACTER_STATS_CLASS_TAB[classId] ?? CHARACTER_STATS_DEFAULT_TAB;
}

export function parseStatsTab(raw: unknown): CharacterStatsTab | null {
  return CHARACTER_STATS_TABS.find((tab) => tab === raw) ?? null;
}
