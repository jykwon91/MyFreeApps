/**
 * Canonical WoW Forever stat keys.
 *
 * MUST match `backend/app/services/wow/stat_keys.py` (`StatKey`) — same keys,
 * same order. `backend/tests/test_wow_stat_keys_parity.py` fails CI on drift.
 *
 * Units: `*_pct` is a percentage as a Classic Era tooltip shows it; `*_rating`
 * is a combat rating (Forever may show ratings, and their conversion to percent
 * isn't published, so ratings are captured but not scored); the rest are flat.
 */
export const STAT_KEYS = [
  // Primary
  "strength",
  "agility",
  "stamina",
  "intellect",
  "spirit",
  // Physical
  "attack_power",
  "ranged_attack_power",
  "feral_attack_power",
  "hit_pct",
  "crit_pct",
  "haste_pct",
  "expertise",
  // Spell
  "spell_power",
  "spell_damage",
  "healing",
  "arcane_spell_damage",
  "fire_spell_damage",
  "frost_spell_damage",
  "holy_spell_damage",
  "nature_spell_damage",
  "shadow_spell_damage",
  "spell_hit_pct",
  "spell_crit_pct",
  "spell_haste_pct",
  "spell_penetration",
  "mp5",
  // Defensive
  "defense",
  "dodge_pct",
  "parry_pct",
  "block_pct",
  "block_value",
  // Resistances
  "all_resistance",
  "arcane_resistance",
  "fire_resistance",
  "frost_resistance",
  "nature_resistance",
  "shadow_resistance",
  // Ratings (captured, not scored)
  "hit_rating",
  "crit_rating",
  "spell_hit_rating",
  "spell_crit_rating",
  "haste_rating",
  "expertise_rating",
  "defense_rating",
  "dodge_rating",
  "parry_rating",
  "block_rating",
  // Flat pools (captured, not scored)
  "health",
  "mana",
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

/** Partial stat line of one item: only the stats it has. */
export type StatValues = Partial<Record<StatKey, number>>;

const PERCENT_SUFFIX = "_pct";

export const STAT_LABELS: Record<StatKey, string> = {
  strength: "Strength",
  agility: "Agility",
  stamina: "Stamina",
  intellect: "Intellect",
  spirit: "Spirit",
  attack_power: "Attack power",
  ranged_attack_power: "Ranged attack power",
  feral_attack_power: "Feral attack power",
  hit_pct: "Hit %",
  crit_pct: "Crit %",
  haste_pct: "Attack speed %",
  expertise: "Expertise",
  spell_power: "Spell damage & healing",
  spell_damage: "Spell damage",
  healing: "Healing",
  arcane_spell_damage: "Arcane spell damage",
  fire_spell_damage: "Fire spell damage",
  frost_spell_damage: "Frost spell damage",
  holy_spell_damage: "Holy spell damage",
  nature_spell_damage: "Nature spell damage",
  shadow_spell_damage: "Shadow spell damage",
  spell_hit_pct: "Spell hit %",
  spell_crit_pct: "Spell crit %",
  spell_haste_pct: "Casting speed %",
  spell_penetration: "Spell penetration",
  mp5: "Mana per 5 sec",
  defense: "Defense",
  dodge_pct: "Dodge %",
  parry_pct: "Parry %",
  block_pct: "Block %",
  block_value: "Block value",
  all_resistance: "All resistances",
  arcane_resistance: "Arcane resistance",
  fire_resistance: "Fire resistance",
  frost_resistance: "Frost resistance",
  nature_resistance: "Nature resistance",
  shadow_resistance: "Shadow resistance",
  hit_rating: "Hit rating",
  crit_rating: "Crit rating",
  spell_hit_rating: "Spell hit rating",
  spell_crit_rating: "Spell crit rating",
  haste_rating: "Haste rating",
  expertise_rating: "Expertise rating",
  defense_rating: "Defense rating",
  dodge_rating: "Dodge rating",
  parry_rating: "Parry rating",
  block_rating: "Block rating",
  health: "Health",
  mana: "Mana",
};

export function isStatKey(value: string): value is StatKey {
  return (STAT_KEYS as readonly string[]).includes(value);
}

/** "+1% Hit" style display of one stat amount. */
export function formatStatAmount(key: StatKey, value: number): string {
  const sign = value > 0 ? "+" : "";
  const unit = key.endsWith(PERCENT_SUFFIX) ? "%" : "";
  return `${sign}${Number(value.toFixed(2))}${unit}`;
}
