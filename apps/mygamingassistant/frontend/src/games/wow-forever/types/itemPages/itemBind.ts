/** ItemSparse.Bonding: how the item binds — on pickup, on equip, on use, or a quest item. */
export const ITEM_BIND = { pickup: 1, equip: 2, use: 3, quest: 4 } as const;
export type ItemBind = (typeof ITEM_BIND)[keyof typeof ITEM_BIND];
