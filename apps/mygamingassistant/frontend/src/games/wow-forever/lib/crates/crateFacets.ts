import { CRATE_TIERS } from "@/games/wow-forever/data/professions/crates/crateTiers";
import { filterCrateRows } from "@/games/wow-forever/lib/crates/filterCrateRows";
import { countByTier } from "@/games/wow-forever/lib/professionTiers/countByTier";
import type { CrateFilters } from "@/games/wow-forever/types/crates/crateFilters";
import type { CrateRow } from "@/games/wow-forever/types/crates/crateRow";
import type { CrateTier } from "@/games/wow-forever/types/crates/crateTier";
import type { TierCounts } from "@/games/wow-forever/types/professionTiers/tierCounts";

/** How many crates each tier would show with the other filters applied (the tier filter itself ignored). */
export function crateTierCounts(rows: readonly CrateRow[], filters: CrateFilters): TierCounts<CrateTier> {
  return countByTier(filterCrateRows(rows, { ...filters, tier: null }), CRATE_TIERS, (row) => row.crate.tier);
}
