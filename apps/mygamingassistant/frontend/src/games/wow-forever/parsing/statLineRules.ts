import type { StatKey } from "@/games/wow-forever/data/statKeys";

/**
 * One tooltip-line pattern -> stat. The first capture group is the number.
 * Order matters: more specific patterns (spell hit, ranged AP, school damage,
 * ratings) come before the general ones they'd otherwise match.
 *
 * Patterns cover Classic Era wording ("Equip: Improves your chance to hit by
 * 1%.") and the rated TBC-style wording Forever may use ("+10 Hit Rating").
 */
export interface StatLineRule {
  stat: StatKey;
  pattern: RegExp;
}

const N = String.raw`(\d+(?:\.\d+)?)`;
const SCHOOLS = ["arcane", "fire", "frost", "holy", "nature", "shadow"] as const;

function rule(stat: StatKey, source: string): StatLineRule {
  return { stat, pattern: new RegExp(source, "i") };
}

const schoolDamageRules: StatLineRule[] = SCHOOLS.map((school) =>
  rule(
    `${school}_spell_damage` as StatKey,
    String.raw`increases damage done by ${school} spells and effects by up to ${N}`,
  ),
);

const schoolResistanceRules: StatLineRule[] = SCHOOLS.filter((s) => s !== "holy").map((school) =>
  rule(`${school}_resistance` as StatKey, String.raw`^\+?${N} ${school} resistance`),
);

export const STAT_LINE_RULES: readonly StatLineRule[] = [
  // Ratings first — "hit rating" must not fall through to the percent rules.
  rule("spell_hit_rating", String.raw`spell hit rating by ${N}|^\+?${N} spell hit rating`),
  rule("spell_crit_rating", String.raw`spell critical strike rating by ${N}|^\+?${N} spell critical (?:strike )?rating`),
  rule("hit_rating", String.raw`hit rating by ${N}|^\+?${N} hit rating`),
  rule("crit_rating", String.raw`critical strike rating by ${N}|^\+?${N} (?:critical strike|crit) rating`),
  rule("haste_rating", String.raw`haste rating by ${N}|^\+?${N} haste rating`),
  rule("expertise_rating", String.raw`expertise rating by ${N}|^\+?${N} expertise rating`),
  rule("defense_rating", String.raw`defense rating by ${N}|^\+?${N} defense rating`),
  rule("dodge_rating", String.raw`dodge rating by ${N}|^\+?${N} dodge rating`),
  rule("parry_rating", String.raw`parry rating by ${N}|^\+?${N} parry rating`),
  rule("block_rating", String.raw`block rating by ${N}|^\+?${N} block rating`),
  // Percent-style (Classic Era).
  rule("spell_hit_pct", String.raw`chance to hit with spells by ${N}%`),
  rule("spell_crit_pct", String.raw`critical strike with spells by ${N}%`),
  rule("hit_pct", String.raw`chance to hit by ${N}%`),
  rule("crit_pct", String.raw`chance to get a critical strike by ${N}%`),
  rule("spell_haste_pct", String.raw`casting speed .*by ${N}%`),
  rule("haste_pct", String.raw`attack speed by ${N}%`),
  rule("dodge_pct", String.raw`chance to dodge an attack by ${N}%`),
  rule("parry_pct", String.raw`chance to parry an attack by ${N}%`),
  rule("block_pct", String.raw`chance to block attacks with a shield by ${N}%`),
  rule("expertise", String.raw`increases your expertise by ${N}|^\+?${N} expertise$`),
  // Flat.
  rule("feral_attack_power", String.raw`${N} attack power in cat, bear`),
  rule("ranged_attack_power", String.raw`^(?:equip: )?\+?${N} ranged attack power`),
  rule("attack_power", String.raw`^(?:equip: )?\+?${N} attack power|attack power by ${N}`),
  ...schoolDamageRules,
  rule("healing", String.raw`increases healing done by spells and effects by up to ${N}`),
  rule("spell_power", String.raw`damage and healing done by magical spells and effects by up to ${N}|^\+?${N} spell power`),
  rule("spell_damage", String.raw`^\+?${N} spell damage`),
  rule("spell_penetration", String.raw`magical resistances of your spell targets by ${N}|^\+?${N} spell penetration`),
  rule("mp5", String.raw`restores ${N} mana per 5 sec|^\+?${N} mana per 5`),
  rule("block_value", String.raw`block value of your shield by ${N}|^\+?${N} block value`),
  rule("defense", String.raw`increased defense \+${N}|^\+?${N} defense$`),
  rule("all_resistance", String.raw`^\+?${N} all resistances`),
  ...schoolResistanceRules,
  rule("strength", String.raw`^\+?${N} strength`),
  rule("agility", String.raw`^\+?${N} agility`),
  rule("stamina", String.raw`^\+?${N} stamina`),
  rule("intellect", String.raw`^\+?${N} intellect`),
  rule("spirit", String.raw`^\+?${N} spirit`),
  rule("health", String.raw`^\+?${N} health$`),
  rule("mana", String.raw`^\+?${N} mana$`),
];
