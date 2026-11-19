import type { WritSort } from "@/games/wow-forever/types/writs/writSort";
import type { WritSortKey } from "@/games/wow-forever/types/writs/writSortKey";

export const DEFAULT_WRIT_SORT: WritSort = { key: "total", direction: "asc" };

export const WRIT_SORT_KEYS: readonly WritSortKey[] = ["name", "tier", "writPrice", "itemPrice", "total"];

export const WRIT_SORT_LABEL: Readonly<Record<WritSortKey, string>> = {
  name: "Writ",
  tier: "Tier",
  writPrice: "Writ price",
  itemPrice: "Item price",
  total: "Total",
};

/** The phone's "Sort by" choices: each key in both directions. */
export const WRIT_SORT_CHOICES: readonly { id: string; label: string; sort: WritSort }[] = WRIT_SORT_KEYS.flatMap((key) => [
  { id: `${key}:asc`, label: `${WRIT_SORT_LABEL[key]} (low to high)`, sort: { key, direction: "asc" as const } },
  { id: `${key}:desc`, label: `${WRIT_SORT_LABEL[key]} (high to low)`, sort: { key, direction: "desc" as const } },
]);
