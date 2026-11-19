import { crateSearchHaystacks } from "@/games/wow-forever/lib/crates/crateSearchHaystacks";
import { matchesSearch } from "@/games/wow-forever/lib/professionTiers/matchesSearch";
import type { CrateFilters } from "@/games/wow-forever/types/crates/crateFilters";
import type { CrateRow } from "@/games/wow-forever/types/crates/crateRow";

/** The rows that pass every filter that is set. */
export function filterCrateRows(rows: readonly CrateRow[], filters: CrateFilters): CrateRow[] {
  return rows.filter(
    (row) => (filters.tier === null || row.crate.tier === filters.tier) && matchesSearch(crateSearchHaystacks(row), filters.query),
  );
}
