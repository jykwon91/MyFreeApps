import { WRIT_LOCATION_UNKNOWN } from "@/games/wow-forever/data/professions/writs/writParams";
import { matchesSearch } from "@/games/wow-forever/lib/professionTiers/matchesSearch";
import { writSearchHaystacks } from "@/games/wow-forever/lib/writs/writSearchHaystacks";
import type { WritFilters } from "@/games/wow-forever/types/writs/writFilters";
import type { WritRow } from "@/games/wow-forever/types/writs/writRow";

/** The value `?loc=` takes for a row: its turn-in zone, or "unknown". */
export function writLocationOf(row: WritRow): string {
  return row.turnIn?.zone ?? WRIT_LOCATION_UNKNOWN;
}

/** The rows that pass every filter that is set. */
export function filterWritRows(rows: readonly WritRow[], filters: WritFilters): WritRow[] {
  return rows.filter(
    (row) =>
      (filters.tier === null || row.writ.tier === filters.tier) &&
      (filters.location === null || writLocationOf(row) === filters.location) &&
      (!filters.dealsOnly || row.deal) &&
      matchesSearch(writSearchHaystacks(row), filters.query),
  );
}
