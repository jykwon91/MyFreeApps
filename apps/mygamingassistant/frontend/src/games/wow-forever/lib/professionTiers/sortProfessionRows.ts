import type { SortDirection } from "@/games/wow-forever/types/professionTiers/sortDirection";

/**
 * A new array in the chosen order. Unknown (null) values come last in both directions; ties fall back to `tieBreak`.
 */
export function sortProfessionRows<R>(
  rows: readonly R[],
  direction: SortDirection,
  valueOf: (row: R) => number | string | null,
  tieBreak: (a: R, b: R) => number,
): R[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    if (left === null && right !== null) return 1;
    if (left !== null && right === null) return -1;
    if (left === null || right === null) return tieBreak(a, b);
    const byValue = typeof left === "string" && typeof right === "string" ? left.localeCompare(right) : Number(left) - Number(right);
    return sign * byValue || tieBreak(a, b);
  });
}
