import type { StatValues } from "@/games/wow-forever/data/statKeys";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

/** The item with its Equip spell's flat stats added to its stat lines (same item when it has none). */
export function withEquipStats(item: ClientItem, equipStats: ReadonlyMap<number, StatValues>): ClientItem {
  const extra = equipStats.get(item.id);
  if (!extra) return item;
  const stats: StatValues = { ...item.stats };
  for (const [key, amount] of Object.entries(extra) as [keyof StatValues, number][]) {
    stats[key] = (stats[key] ?? 0) + amount;
  }
  return { ...item, stats };
}
