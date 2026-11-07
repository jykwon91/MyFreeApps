import { MAX_ITEM_ID_DIGITS } from "@/games/wow-forever/data/bisLists/bisListConfig";
import { isBisSlotId, type BisSlotId } from "@/games/wow-forever/data/bisLists/bisSlots";
import type { BisListItems } from "@/games/wow-forever/types/bisLists/bisListItems";

const ID_PATTERN = new RegExp(`^[1-9]\\d{0,${MAX_ITEM_ID_DIGITS - 1}}$`);

/** A positive whole item id (a number, or digits only), else null. */
export function parseItemId(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isInteger(raw) ? parseItemId(String(raw)) : null;
  if (typeof raw !== "string" || !ID_PATTERN.test(raw)) return null;
  return Number(raw);
}

/** Rows from untrusted (slot, id) pairs: unknown slots and bad ids are ignored, and a repeated slot keeps its first id. */
export function parseBisListItems(entries: Iterable<readonly [string, unknown]>): BisListItems {
  const items: Partial<Record<BisSlotId, number>> = {};
  for (const [slot, raw] of entries) {
    if (!isBisSlotId(slot) || items[slot] !== undefined) continue;
    const id = parseItemId(raw);
    if (id !== null) items[slot] = id;
  }
  return items;
}
