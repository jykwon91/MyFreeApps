import { ROW_STAT_COUNT } from "@/games/wow-forever/data/itemSearchConfig";
import { SLOT_LABELS } from "@/games/wow-forever/data/itemSlots";
import { formatStatAmount, isStatKey, type StatKey } from "@/games/wow-forever/data/statKeys";
import { STAT_SHORT_LABELS } from "@/games/wow-forever/data/statShortLabels";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { WeaponStats } from "@/games/wow-forever/types/compareItem";

/** "+8 Int +5 Spi": the item's biggest stats, at most ROW_STAT_COUNT. */
export function topStatsLine(item: ClientItem): string {
  return Object.entries(item.stats)
    .filter((entry): entry is [StatKey, number] => isStatKey(entry[0]) && typeof entry[1] === "number")
    .sort((a, b) => b[1] - a[1])
    .slice(0, ROW_STAT_COUNT)
    .map(([key, value]) => `${formatStatAmount(key, value)} ${STAT_SHORT_LABELS[key]}`)
    .join(" ");
}

/** "20 - 38 damage, speed 2.6". */
export function formatWeapon(weapon: WeaponStats): string {
  return `${weapon.minDamage} - ${weapon.maxDamage} damage, speed ${weapon.speed}`;
}

/** "Chest, Cloth · ilvl 34 · req 29 · +8 Int +5 Spi" — a result row's second line. */
export function describeClientItem(item: ClientItem): string {
  const slot = item.itemType ? `${SLOT_LABELS[item.slot]}, ${item.itemType}` : SLOT_LABELS[item.slot];
  const parts = [slot, `ilvl ${item.itemLevel}`];
  if (item.requiredLevel > 0) parts.push(`req ${item.requiredLevel}`);
  const stats = item.randomSuffix ? "random suffix" : topStatsLine(item);
  if (stats) parts.push(stats);
  return parts.join(" · ");
}
