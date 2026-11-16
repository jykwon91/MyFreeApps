import type { StatKey } from "@/games/wow-forever/data/statKeys";
import type { StatWeights } from "@/games/wow-forever/data/weights/statWeights";
import type { EnchantEffect } from "@/games/wow-forever/types/guild/enchantEffect";

/**
 * How much an enchant is worth to one wearer: its stats times their weights, plus armor, plus flat weapon
 * damage as DPS on this weapon (`weaponSpeed` seconds; null = unknown, so the damage isn't counted).
 * 0 = nothing they'd use (+7 Strength for a Warlock).
 */
export function enchantValue(effect: EnchantEffect, weights: StatWeights, weaponSpeed: number | null): number {
  let total = effect.armor * weights.armor;
  for (const [key, amount] of Object.entries(effect.stats)) {
    total += (amount ?? 0) * (weights.stats[key as StatKey] ?? 0);
  }
  if (effect.weaponDamage > 0 && weaponSpeed) total += (effect.weaponDamage / weaponSpeed) * weights.meleeWeaponDps;
  return total;
}
