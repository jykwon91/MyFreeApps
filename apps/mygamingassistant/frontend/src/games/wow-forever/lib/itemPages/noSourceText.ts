import { FIRST_FOREVER_ITEM_ID } from "@/games/wow-forever/food/recipeSources";

/** Why "How to get it" is empty: a Forever-only item, or a Classic item no Classic source lists. */
export function noSourceText(itemId: number): string {
  if (itemId >= FIRST_FOREVER_ITEM_ID) return "New in WoW Forever — where to get it isn't known yet.";
  return "No vendor, quest, drop or recipe for it is in the Classic data, so where to get it in Forever isn't known yet.";
}
