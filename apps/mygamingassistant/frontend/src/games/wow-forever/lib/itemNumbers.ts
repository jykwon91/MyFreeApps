import { STAT_KEYS, type StatKey, type StatValues } from "@/games/wow-forever/data/statKeys";
import type { CompareItem, WeaponStats } from "@/games/wow-forever/types/compareItem";
import type { ItemNumbers } from "@/games/wow-forever/types/itemNumbers";

export function numbersOf(item: CompareItem): ItemNumbers {
  return { armor: item.armor, weapon: item.weapon, stats: item.stats };
}

export function sameWeapon(a: WeaponStats | null, b: WeaponStats | null): boolean {
  if (a === null || b === null) return a === b;
  return a.minDamage === b.minDamage && a.maxDamage === b.maxDamage && a.speed === b.speed;
}

/** Stat keys whose amount differs between the two (added, removed or changed). */
export function changedStatKeys(stats: StatValues, baseline: StatValues): StatKey[] {
  return STAT_KEYS.filter((k) => stats[k] !== baseline[k]);
}

export function sameNumbers(a: ItemNumbers, b: ItemNumbers): boolean {
  return a.armor === b.armor && sameWeapon(a.weapon, b.weapon) && changedStatKeys(a.stats, b.stats).length === 0;
}

/** Picked from the game files and then changed by the player. */
export function isEditedFromGameFiles(item: CompareItem): boolean {
  return item.origin !== null && !sameNumbers(numbersOf(item), item.origin.baseline);
}

/** Put the game-file numbers back (keeps the name and everything else). */
export function resetToGameFiles(item: CompareItem): CompareItem {
  if (item.origin === null) return item;
  const { armor, weapon, stats } = item.origin.baseline;
  return { ...item, armor, weapon, stats };
}
