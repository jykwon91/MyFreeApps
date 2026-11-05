import type { CompareItem } from "@/games/wow-forever/types/compareItem";

/** For each card, the 1-based position of the first earlier card holding the same game-file item, else null. */
export function sameItemPositions(items: readonly CompareItem[]): (number | null)[] {
  const firstAt = new Map<number, number>();
  return items.map((item, i) => {
    const itemId = item.origin?.itemId;
    if (itemId === undefined) return null;
    const earlier = firstAt.get(itemId);
    if (earlier !== undefined) return earlier;
    firstAt.set(itemId, i + 1);
    return null;
  });
}
