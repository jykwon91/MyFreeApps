import type { WeaponStats } from "@/games/wow-forever/types/compareItem";

/** Average damage per second of a weapon, rounded to one decimal like the tooltip. */
export function weaponDps(weapon: WeaponStats): number {
  if (weapon.speed <= 0) return 0;
  const average = (weapon.minDamage + weapon.maxDamage) / 2;
  return Math.round((average / weapon.speed) * 10) / 10;
}
