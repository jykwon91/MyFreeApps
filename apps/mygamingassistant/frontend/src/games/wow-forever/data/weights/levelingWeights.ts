import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { StatWeights } from "@/games/wow-forever/data/weights/statWeights";

/**
 * Leveling stat weights — a simple, documented HEURISTIC, not a sim result.
 *
 * While leveling you fight many same-level mobs alone, so the rules of thumb are:
 *   1. Weapon DPS is king for physical classes (your white hits and most
 *      abilities scale off it), so a weapon upgrade outweighs a few stat points.
 *      Casters get real value from wand DPS too (wanding is a big share of
 *      leveling damage for Mage/Priest/Warlock).
 *   2. Your main stat is 1.0.
 *   3. Stamina matters more than at 60 (less downtime, fewer deaths): ~0.5-0.8.
 *   4. Spirit is decent for mana users (between-fight regen), strong for Priests.
 *   5. Hit/crit percent are kept at roughly Level-60 relative values.
 * Spec doesn't change these — pick a spec and the Level 60 bracket for spec
 * weights. Keyed by class id.
 */
export const LEVELING_WEIGHTS: Record<WowClassId, StatWeights> = {
  warrior: {
    armor: 0.01,
    meleeWeaponDps: 4,
    rangedWeaponDps: 0,
    stats: { strength: 1, agility: 0.5, stamina: 0.6, attack_power: 0.5, hit_pct: 6, crit_pct: 6, defense: 0.1 },
  },
  rogue: {
    armor: 0.01,
    meleeWeaponDps: 4,
    rangedWeaponDps: 0,
    stats: { agility: 1, strength: 0.5, stamina: 0.5, attack_power: 0.5, hit_pct: 6, crit_pct: 6 },
  },
  hunter: {
    armor: 0.01,
    meleeWeaponDps: 0.5,
    rangedWeaponDps: 3.5,
    stats: {
      agility: 1,
      intellect: 0.3,
      stamina: 0.5,
      spirit: 0.1,
      ranged_attack_power: 0.5,
      attack_power: 0.4,
      hit_pct: 6,
      crit_pct: 5,
    },
  },
  paladin: {
    armor: 0.01,
    meleeWeaponDps: 3.5,
    rangedWeaponDps: 0,
    stats: {
      strength: 1,
      stamina: 0.6,
      intellect: 0.35,
      agility: 0.3,
      spirit: 0.1,
      attack_power: 0.5,
      hit_pct: 5,
      crit_pct: 5,
      spell_power: 0.3,
      mp5: 0.5,
    },
  },
  shaman: {
    armor: 0.01,
    meleeWeaponDps: 3.5,
    rangedWeaponDps: 0,
    stats: {
      strength: 1,
      agility: 0.5,
      intellect: 0.4,
      stamina: 0.6,
      spirit: 0.1,
      attack_power: 0.5,
      hit_pct: 5,
      crit_pct: 5,
      spell_power: 0.3,
      mp5: 0.5,
    },
  },
  druid: {
    armor: 0.01,
    meleeWeaponDps: 0,
    rangedWeaponDps: 0,
    stats: {
      strength: 0.8,
      agility: 0.8,
      intellect: 0.5,
      stamina: 0.6,
      spirit: 0.3,
      attack_power: 0.4,
      feral_attack_power: 0.4,
      hit_pct: 5,
      crit_pct: 5,
      spell_power: 0.5,
      mp5: 0.5,
    },
  },
  mage: {
    armor: 0,
    meleeWeaponDps: 0,
    rangedWeaponDps: 1.5,
    stats: {
      intellect: 1,
      spirit: 0.6,
      stamina: 0.7,
      spell_power: 0.8,
      spell_damage: 0.8,
      fire_spell_damage: 0.6,
      frost_spell_damage: 0.6,
      spell_hit_pct: 5,
      spell_crit_pct: 4,
      mp5: 0.6,
    },
  },
  priest: {
    armor: 0,
    meleeWeaponDps: 0,
    rangedWeaponDps: 1.5,
    stats: {
      intellect: 1,
      spirit: 0.9,
      stamina: 0.7,
      spell_power: 0.8,
      spell_damage: 0.7,
      shadow_spell_damage: 0.7,
      healing: 0.2,
      spell_hit_pct: 5,
      spell_crit_pct: 3,
      mp5: 0.6,
    },
  },
  warlock: {
    armor: 0,
    meleeWeaponDps: 0,
    rangedWeaponDps: 1.5,
    stats: {
      intellect: 0.7,
      stamina: 1,
      spirit: 0.3,
      spell_power: 0.9,
      spell_damage: 0.9,
      shadow_spell_damage: 0.8,
      fire_spell_damage: 0.4,
      spell_hit_pct: 5,
      spell_crit_pct: 3,
      mp5: 0.4,
    },
  },
};
