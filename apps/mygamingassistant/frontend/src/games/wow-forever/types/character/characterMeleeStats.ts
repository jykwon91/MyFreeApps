import type { CharacterWeaponDamage } from "@/games/wow-forever/types/character/characterWeaponDamage";

/** The pane's Melee tab. Chances are percents. A hand is null when it holds no weapon. */
export interface CharacterMeleeStats {
  attack_power: number;
  main_hand: CharacterWeaponDamage | null;
  off_hand: CharacterWeaponDamage | null;
  crit: number;
  hit: number;
  haste: number;
  expertise: number;
}
