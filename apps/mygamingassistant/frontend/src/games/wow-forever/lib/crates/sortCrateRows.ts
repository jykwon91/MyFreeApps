import { CRATE_TIERS } from "@/games/wow-forever/data/professions/crates/crateTiers";
import { sortProfessionRows } from "@/games/wow-forever/lib/professionTiers/sortProfessionRows";
import type { CrateRow } from "@/games/wow-forever/types/crates/crateRow";
import type { CrateSort } from "@/games/wow-forever/types/crates/crateSort";
import type { CrateSortKey } from "@/games/wow-forever/types/crates/crateSortKey";

function valueOf(row: CrateRow, key: CrateSortKey): number | string | null {
  if (key === "name") return row.crate.name;
  if (key === "tier") return CRATE_TIERS.indexOf(row.crate.tier);
  if (key === "cratePrice") return row.cratePrice;
  if (key === "bundleCost") return row.bundleCost;
  return row.total;
}

/** A new array in the chosen order. Unknown prices come last in both directions; ties fall back to the crate name. */
export function sortCrateRows(rows: readonly CrateRow[], sort: CrateSort): CrateRow[] {
  return sortProfessionRows(
    rows,
    sort.direction,
    (row) => valueOf(row, sort.key),
    (a, b) => a.crate.name.localeCompare(b.crate.name) || a.crate.id - b.crate.id,
  );
}
