import { formatStatAmount, isStatKey, STAT_LABELS, type StatKey } from "@/games/wow-forever/data/statKeys";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

/** Stats the tooltip prints as plain "+10 Stamina" lines; the rest are green "Equip:" lines. */
const BASE_STATS: ReadonlySet<StatKey> = new Set<StatKey>([
  "strength",
  "agility",
  "stamina",
  "intellect",
  "spirit",
  "all_resistance",
  "arcane_resistance",
  "fire_resistance",
  "frost_resistance",
  "nature_resistance",
  "shadow_resistance",
]);

export interface ItemStatLine {
  key: StatKey;
  text: string;
  equip: boolean;
}

/** The tooltip's stat lines: base stats first (as the game orders them), then the equip effects. */
export function itemStatLines(item: ClientItem): ItemStatLine[] {
  const lines = Object.entries(item.stats)
    .filter((entry): entry is [StatKey, number] => isStatKey(entry[0]) && typeof entry[1] === "number" && entry[1] !== 0)
    .map(([key, value]) => {
      const equip = !BASE_STATS.has(key);
      const amount = formatStatAmount(key, value);
      return { key, equip, text: equip ? `Equip: ${amount} ${STAT_LABELS[key]}` : `${amount} ${STAT_LABELS[key]}` };
    });
  return [...lines.filter((l) => !l.equip), ...lines.filter((l) => l.equip)];
}
