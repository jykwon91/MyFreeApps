import { buildSortChoices } from "@/games/wow-forever/lib/professionTiers/buildSortChoices";
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

export const WRIT_SORT_CHOICES = buildSortChoices(WRIT_SORT_KEYS, WRIT_SORT_LABEL);
