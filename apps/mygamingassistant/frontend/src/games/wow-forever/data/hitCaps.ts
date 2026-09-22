/**
 * Classic Era hit caps against raid bosses (3 levels above you), from gear.
 *
 * - Melee / ranged special attacks: 9% (base 8% miss with 300 weapon skill,
 *   plus the first 1% of +hit is suppressed when the level/skill gap is > 10).
 *   Higher weapon skill lowers it (e.g. ~6% at 305+).
 * - Spells: 16% (base 17% miss vs +3 levels; 1% of spells always miss).
 *
 * Approximate for Forever — its combat numbers aren't published yet.
 */
export const MELEE_HIT_CAP_PCT = 9;
export const SPELL_HIT_CAP_PCT = 16;
