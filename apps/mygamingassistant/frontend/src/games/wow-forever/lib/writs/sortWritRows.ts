import { WRIT_TIERS } from "@/games/wow-forever/data/professions/writs/writTiers";
import { sortProfessionRows } from "@/games/wow-forever/lib/professionTiers/sortProfessionRows";
import type { WritRow } from "@/games/wow-forever/types/writs/writRow";
import type { WritSort } from "@/games/wow-forever/types/writs/writSort";
import type { WritSortKey } from "@/games/wow-forever/types/writs/writSortKey";

function valueOf(row: WritRow, key: WritSortKey): number | string | null {
  if (key === "name") return row.writ.name;
  if (key === "tier") return WRIT_TIERS.indexOf(row.writ.tier);
  if (key === "writPrice") return row.writPrice;
  if (key === "itemPrice") return row.itemPrice;
  return row.total;
}

/** A new array in the chosen order. Unknown prices come last in both directions; ties fall back to the writ name. */
export function sortWritRows(rows: readonly WritRow[], sort: WritSort): WritRow[] {
  return sortProfessionRows(
    rows,
    sort.direction,
    (row) => valueOf(row, sort.key),
    (a, b) => a.writ.name.localeCompare(b.writ.name) || a.writ.id - b.writ.id,
  );
}
