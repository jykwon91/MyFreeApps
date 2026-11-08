/** What the item browser sorts by (the URL's `sort` values). */
export const ITEM_SORT = { itemLevel: "ilvl", requiredLevel: "req", name: "name" } as const;
export type ItemSortKey = (typeof ITEM_SORT)[keyof typeof ITEM_SORT];
