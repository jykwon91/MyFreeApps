import { ITEM_PAGE_PATH } from "@/games/wow-forever/data/itemPages/itemPageConfig";

/** `/wow-forever/items/11815`. */
export function itemPageHref(itemId: number): string {
  return `${ITEM_PAGE_PATH}/${itemId}`;
}

/** The `:id` route param as an item id, or null when it isn't a positive whole number. */
export function parseItemId(raw: string | undefined): number | null {
  if (!raw || !/^\d{1,7}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}
