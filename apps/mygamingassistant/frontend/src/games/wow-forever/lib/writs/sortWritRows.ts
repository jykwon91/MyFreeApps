import { WRIT_TIERS } from "@/games/wow-forever/data/professions/writs/writTiers";
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

function compareValues(a: number | string, b: number | string): number {
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  return Number(a) - Number(b);
}

/** A new array in the chosen order. Unknown prices come last in both directions; ties fall back to the writ name. */
export function sortWritRows(rows: readonly WritRow[], sort: WritSort): WritRow[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = valueOf(a, sort.key);
    const right = valueOf(b, sort.key);
    if (left === null && right !== null) return 1;
    if (left !== null && right === null) return -1;
    const byKey = left === null || right === null ? 0 : sign * compareValues(left, right);
    return byKey || a.writ.name.localeCompare(b.writ.name) || a.writ.id - b.writ.id;
  });
}
