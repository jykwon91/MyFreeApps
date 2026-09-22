import type { StatWeights } from "@/games/wow-forever/data/weights/statWeights";

/**
 * Level-60 stat weights — Pawn's built-in "Classic" scales for WoW Classic Era.
 *
 * Source: Pawn addon by Vger (VgerMods), file `ClassicHawsJon.lua`, the
 * `VgerCore.IsClassic` branch. Pawn credits these Classic Era scales to HawsJon
 * (http://tbcwowaddons.weebly.com/pawn.html). Pawn's WoWSims-sourced scales are
 * its Cataclysm Classic ones, not these.
 *   https://github.com/VgerMods/Pawn/blob/e68b5c43c527df8a0029f04e6fc15191518d54e3/ClassicHawsJon.lua
 *
 * Conversion: Pawn stores TBC-style RATING weights and, on Classic Era, multiplies
 * each by a level-60 rating-per-percent factor (HitRatingPer = 9.37931,
 * CritRatingPer = 8.5, SpellHit/SpellCritRatingPer = 8, HasteRatingPer = 8.03,
 * ExpertiseRatingPer = 2.34483, DefenseRatingPer = 1.5, Dodge/ParryRatingPer =
 * 9.44, BlockRatingPer = 6.9). The values below are those PRE-MULTIPLIED weights,
 * so hit_pct is "per 1% hit" and defense is "per 1 defense skill", matching how a
 * Classic Era tooltip shows them. `spell_power` (damage AND healing) is Pawn's
 * SpellDamage + Healing; `expertise` uses Pawn's expertise factor (Classic Era has
 * no expertise, so treat it as a rough guess for Forever).
 *
 * Omitted: Pawn's Mana/Health/Hp5/Resilience/Armor Penetration/meta-socket
 * weights (TBC-only or not on Classic tooltips) and the rogue off-hand scale.
 *
 * Approximate for Forever: Forever's stat values aren't published yet and talents
 * are being reworked. The UI says so next to every score.
 */
export const PAWN_CLASSIC_WEIGHTS: Record<string, StatWeights> = {
  "druid/balance": {
    armor: 0.005,
    meleeWeaponDps: 0,
    rangedWeaponDps: 0,
    stats: { agility: 0.05, stamina: 0.1, intellect: 0.38, spirit: 0.34, spell_damage: 1, spell_hit_pct: 9.68, spell_crit_pct: 4.96, spell_haste_pct: 6.424, spell_penetration: 0.21, mp5: 0.58, arcane_spell_damage: 0.64, nature_spell_damage: 0.43, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04, spell_power: 1 },
  },
  "druid/feral-damage": {
    armor: 0.02,
    meleeWeaponDps: 0,
    rangedWeaponDps: 0,
    stats: { strength: 1.48, agility: 1, stamina: 0.1, intellect: 0.1, spirit: 0.05, attack_power: 0.59, feral_attack_power: 0.59, hit_pct: 5.7214, crit_pct: 5.015, haste_pct: 3.4529, expertise: 1.4303, healing: 0.025, mp5: 0.3, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04, spell_power: 0.025 },
  },
  "druid/feral-tank": {
    armor: 0.1,
    meleeWeaponDps: 0,
    rangedWeaponDps: 0,
    stats: { strength: 0.2, agility: 0.48, stamina: 1, intellect: 0.1, spirit: 0.05, attack_power: 0.34, feral_attack_power: 0.34, hit_pct: 1.5007, crit_pct: 1.275, haste_pct: 2.4893, expertise: 0.4221, healing: 0.025, mp5: 0.3, nature_spell_damage: 0.025, defense: 0.39, dodge_pct: 3.5872, all_resistance: 1, arcane_resistance: 0.2, fire_resistance: 0.2, frost_resistance: 0.2, nature_resistance: 0.2, shadow_resistance: 0.2, spell_power: 0.025 },
  },
  "druid/restoration": {
    armor: 0.005,
    meleeWeaponDps: 0,
    rangedWeaponDps: 0,
    stats: { agility: 0.05, stamina: 0.1, intellect: 1, spirit: 0.87, healing: 1.21, spell_crit_pct: 2.8, spell_haste_pct: 3.9347, mp5: 1.7, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04, spell_power: 1.21 },
  },
  "hunter/beast-mastery": {
    armor: 0.005,
    meleeWeaponDps: 0.75,
    rangedWeaponDps: 2.4,
    stats: { strength: 0.05, agility: 1, stamina: 0.1, intellect: 0.8, spirit: 0.05, attack_power: 0.43, ranged_attack_power: 0.43, hit_pct: 9.3793, crit_pct: 6.8, haste_pct: 4.015, expertise: 0.1172, mp5: 2.4, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04 },
  },
  "hunter/marksmanship": {
    armor: 0.005,
    meleeWeaponDps: 0.75,
    rangedWeaponDps: 2.6,
    stats: { strength: 0.05, agility: 1, stamina: 0.1, intellect: 0.9, spirit: 0.05, attack_power: 0.55, ranged_attack_power: 0.55, hit_pct: 9.3793, crit_pct: 5.1, haste_pct: 3.212, expertise: 0.1172, mp5: 2.4, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04 },
  },
  "hunter/survival": {
    armor: 0.005,
    meleeWeaponDps: 1,
    rangedWeaponDps: 2.4,
    stats: { strength: 0.05, agility: 1, stamina: 0.1, intellect: 0.8, spirit: 0.05, attack_power: 0.55, ranged_attack_power: 0.55, hit_pct: 9.3793, crit_pct: 5.525, haste_pct: 3.212, expertise: 0.1172, mp5: 2.4, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04 },
  },
  "mage/arcane": {
    armor: 0.005,
    meleeWeaponDps: 0,
    rangedWeaponDps: 0,
    stats: { agility: 0.05, stamina: 0.1, intellect: 0.46, spirit: 0.59, spell_damage: 1, spell_hit_pct: 6.96, spell_crit_pct: 4.8, spell_haste_pct: 4.7377, spell_penetration: 0.09, mp5: 1.13, arcane_spell_damage: 0.88, fire_spell_damage: 0.064, frost_spell_damage: 0.52, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04, spell_power: 1 },
  },
  "mage/fire": {
    armor: 0.005,
    meleeWeaponDps: 0,
    rangedWeaponDps: 0,
    stats: { agility: 0.05, stamina: 0.1, intellect: 0.44, spirit: 0.066, spell_damage: 1, spell_hit_pct: 7.44, spell_crit_pct: 6.16, spell_haste_pct: 6.5846, spell_penetration: 0.09, mp5: 0.9, arcane_spell_damage: 0.168, fire_spell_damage: 0.94, frost_spell_damage: 0.32, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04, spell_power: 1 },
  },
  "mage/frost": {
    armor: 0.005,
    meleeWeaponDps: 0,
    rangedWeaponDps: 0,
    stats: { agility: 0.05, stamina: 0.1, intellect: 0.37, spirit: 0.06, spell_damage: 1, spell_hit_pct: 9.76, spell_crit_pct: 4.64, spell_haste_pct: 5.0589, spell_penetration: 0.07, mp5: 0.8, arcane_spell_damage: 0.13, fire_spell_damage: 0.05, frost_spell_damage: 0.95, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04, spell_power: 1 },
  },
  "paladin/holy": {
    armor: 0.005,
    meleeWeaponDps: 0,
    rangedWeaponDps: 0,
    stats: { agility: 0.05, stamina: 0.1, intellect: 1, spirit: 0.28, healing: 0.54, spell_crit_pct: 3.68, spell_haste_pct: 3.1317, mp5: 1.24, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, block_pct: 0.069, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04, spell_power: 0.54 },
  },
  "paladin/protection": {
    armor: 0.02,
    meleeWeaponDps: 1.77,
    rangedWeaponDps: 0,
    stats: { strength: 0.2, agility: 0.6, stamina: 1, intellect: 0.5, spirit: 0.05, attack_power: 0.06, hit_pct: 1.5007, crit_pct: 1.275, haste_pct: 4.015, expertise: 0.6331, spell_damage: 0.44, spell_hit_pct: 6.24, spell_crit_pct: 4.8, spell_haste_pct: 0.9636, spell_penetration: 0.03, mp5: 1, holy_spell_damage: 0.44, defense: 1.05, dodge_pct: 6.608, parry_pct: 5.664, block_pct: 4.14, block_value: 0.15, all_resistance: 1, arcane_resistance: 0.2, fire_resistance: 0.2, frost_resistance: 0.2, nature_resistance: 0.2, shadow_resistance: 0.2, spell_power: 0.44 },
  },
  "paladin/retribution": {
    armor: 0.005,
    meleeWeaponDps: 5.4,
    rangedWeaponDps: 0,
    stats: { strength: 1, agility: 0.64, stamina: 0.1, intellect: 0.34, spirit: 0.05, attack_power: 0.41, hit_pct: 7.8786, crit_pct: 5.61, haste_pct: 2.0075, expertise: 2.04, spell_damage: 0.33, spell_hit_pct: 1.68, spell_crit_pct: 0.96, spell_haste_pct: 0.3212, spell_penetration: 0.015, mp5: 1, holy_spell_damage: 0.33, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04, spell_power: 0.33 },
  },
  "priest/discipline": {
    armor: 0.005,
    meleeWeaponDps: 0,
    rangedWeaponDps: 0,
    stats: { agility: 0.05, stamina: 0.1, intellect: 1, spirit: 0.48, healing: 0.72, spell_crit_pct: 2.56, spell_haste_pct: 4.5771, mp5: 1.19, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04, spell_power: 0.72 },
  },
  "priest/holy": {
    armor: 0.005,
    meleeWeaponDps: 0,
    rangedWeaponDps: 0,
    stats: { agility: 0.05, stamina: 0.1, intellect: 1, spirit: 0.73, healing: 0.81, spell_crit_pct: 1.92, spell_haste_pct: 4.818, mp5: 1.35, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04, spell_power: 0.81 },
  },
  "priest/shadow": {
    armor: 0.005,
    meleeWeaponDps: 0,
    rangedWeaponDps: 0,
    stats: { agility: 0.05, stamina: 0.1, intellect: 0.19, spirit: 0.21, spell_damage: 1, spell_hit_pct: 8.96, spell_crit_pct: 6.08, spell_haste_pct: 5.2195, spell_penetration: 0.08, mp5: 1, shadow_spell_damage: 1, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04, spell_power: 1 },
  },
  "rogue/assassination": {
    armor: 0.005,
    meleeWeaponDps: 3,
    rangedWeaponDps: 0,
    stats: { strength: 0.5, agility: 1, stamina: 0.1, spirit: 0.05, attack_power: 0.45, hit_pct: 9.3793, crit_pct: 6.885, haste_pct: 7.227, expertise: 2.5793, defense: 0.075, dodge_pct: 0.472, parry_pct: 1.1328, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04 },
  },
  "rogue/combat": {
    armor: 0.005,
    meleeWeaponDps: 3,
    rangedWeaponDps: 0,
    stats: { strength: 0.5, agility: 1, stamina: 0.1, spirit: 0.05, attack_power: 0.45, hit_pct: 9.3793, crit_pct: 6.885, haste_pct: 7.227, expertise: 2.5793, defense: 0.075, dodge_pct: 0.472, parry_pct: 1.1328, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04 },
  },
  "rogue/subtlety": {
    armor: 0.005,
    meleeWeaponDps: 3,
    rangedWeaponDps: 0,
    stats: { strength: 0.5, agility: 1, stamina: 0.1, spirit: 0.05, attack_power: 0.45, hit_pct: 9.3793, crit_pct: 6.885, haste_pct: 7.227, expertise: 2.5793, defense: 0.075, dodge_pct: 0.472, parry_pct: 1.1328, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04 },
  },
  "shaman/elemental": {
    armor: 0.005,
    meleeWeaponDps: 0,
    rangedWeaponDps: 0,
    stats: { agility: 0.05, stamina: 0.1, intellect: 0.31, spirit: 0.09, spell_damage: 1, spell_hit_pct: 7.2, spell_crit_pct: 8.4, spell_haste_pct: 7.227, spell_penetration: 0.38, mp5: 1.14, nature_spell_damage: 1, defense: 0.075, dodge_pct: 0.472, parry_pct: 1.1328, block_pct: 0.069, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04, spell_power: 1 },
  },
  "shaman/enhancement": {
    armor: 0.005,
    meleeWeaponDps: 3,
    rangedWeaponDps: 0,
    stats: { strength: 1, agility: 0.87, stamina: 0.1, intellect: 0.34, spirit: 0.05, attack_power: 0.5, hit_pct: 6.2841, crit_pct: 8.33, haste_pct: 5.1392, expertise: 3.5172, spell_damage: 0.3, spell_hit_pct: 1.784, spell_crit_pct: 2.608, spell_haste_pct: 0.6424, spell_penetration: 0.11, mp5: 1, nature_spell_damage: 0.3, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04, spell_power: 0.3 },
  },
  "shaman/restoration": {
    armor: 0.005,
    meleeWeaponDps: 0,
    rangedWeaponDps: 0,
    stats: { agility: 0.05, stamina: 0.1, intellect: 1, spirit: 0.61, healing: 0.9, spell_crit_pct: 3.84, spell_haste_pct: 5.9422, mp5: 1.33, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, block_pct: 0.069, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04, spell_power: 0.9 },
  },
  "warlock/affliction": {
    armor: 0.005,
    meleeWeaponDps: 0,
    rangedWeaponDps: 0,
    stats: { agility: 0.05, stamina: 0.1, intellect: 0.4, spirit: 0.1, spell_damage: 1, spell_hit_pct: 9.6, spell_crit_pct: 3.12, spell_haste_pct: 6.2634, spell_penetration: 0.08, mp5: 1, fire_spell_damage: 0.35, shadow_spell_damage: 0.91, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04, spell_power: 1 },
  },
  "warlock/demonology": {
    armor: 0.005,
    meleeWeaponDps: 0,
    rangedWeaponDps: 0,
    stats: { agility: 0.05, stamina: 0.1, intellect: 0.4, spirit: 0.5, spell_damage: 1, spell_hit_pct: 9.6, spell_crit_pct: 5.28, spell_haste_pct: 5.621, spell_penetration: 0.08, mp5: 1, fire_spell_damage: 0.8, shadow_spell_damage: 0.8, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04, spell_power: 1 },
  },
  "warlock/destruction": {
    armor: 0.005,
    meleeWeaponDps: 0,
    rangedWeaponDps: 0,
    stats: { agility: 0.05, stamina: 0.1, intellect: 0.34, spirit: 0.25, spell_damage: 1, spell_hit_pct: 12.8, spell_crit_pct: 6.96, spell_haste_pct: 9.2345, spell_penetration: 0.08, mp5: 0.65, fire_spell_damage: 0.23, shadow_spell_damage: 0.95, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04, spell_power: 1 },
  },
  "warrior/arms": {
    armor: 0.005,
    meleeWeaponDps: 5.31,
    rangedWeaponDps: 0,
    stats: { strength: 1, agility: 0.69, stamina: 0.1, spirit: 0.05, attack_power: 0.45, hit_pct: 9.3793, crit_pct: 7.225, haste_pct: 4.5771, expertise: 2.3448, defense: 0.075, dodge_pct: 0.472, parry_pct: 0.472, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04 },
  },
  "warrior/fury": {
    armor: 0.005,
    meleeWeaponDps: 5.22,
    rangedWeaponDps: 0,
    stats: { strength: 1, agility: 0.57, stamina: 0.1, spirit: 0.05, attack_power: 0.54, hit_pct: 5.3462, crit_pct: 5.95, haste_pct: 3.2923, expertise: 1.3366, defense: 0.075, dodge_pct: 0.472, parry_pct: 1.1328, all_resistance: 0.2, arcane_resistance: 0.04, fire_resistance: 0.04, frost_resistance: 0.04, nature_resistance: 0.04, shadow_resistance: 0.04 },
  },
  "warrior/protection": {
    armor: 0.02,
    meleeWeaponDps: 3.13,
    rangedWeaponDps: 0,
    stats: { strength: 0.33, agility: 0.59, stamina: 1, spirit: 0.05, attack_power: 0.06, hit_pct: 6.2841, crit_pct: 2.38, haste_pct: 1.6863, expertise: 1.571, defense: 1.215, dodge_pct: 6.608, parry_pct: 5.4752, block_pct: 4.071, block_value: 0.35, all_resistance: 1, arcane_resistance: 0.2, fire_resistance: 0.2, frost_resistance: 0.2, nature_resistance: 0.2, shadow_resistance: 0.2 },
  },
};
