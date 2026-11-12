import type { CharacterWeaponDamage } from "@/games/wow-forever/types/character/characterWeaponDamage";

/** The pane's Ranged tab. Chances are percents. Damage is null with no ranged weapon. */
export interface CharacterRangedStats {
  attack_power: number;
  damage: CharacterWeaponDamage | null;
  crit: number;
  hit: number;
  haste: number;
}
