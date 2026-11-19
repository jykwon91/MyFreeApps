import { buildSortChoices } from "@/games/wow-forever/lib/professionTiers/buildSortChoices";
import type { CrateSort } from "@/games/wow-forever/types/crates/crateSort";
import type { CrateSortKey } from "@/games/wow-forever/types/crates/crateSortKey";

export const DEFAULT_CRATE_SORT: CrateSort = { key: "total", direction: "asc" };

export const CRATE_SORT_KEYS: readonly CrateSortKey[] = ["name", "tier", "cratePrice", "bundleCost", "total"];

export const CRATE_SORT_LABEL: Readonly<Record<CrateSortKey, string>> = {
  name: "Crate",
  tier: "Tier",
  cratePrice: "Crate price",
  bundleCost: "Bundle cost",
  total: "Total",
};

export const CRATE_SORT_CHOICES = buildSortChoices(CRATE_SORT_KEYS, CRATE_SORT_LABEL);
