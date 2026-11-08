/** The browser's item-class filter, grouped as players think of gear (by slot, so cloaks never count as Cloth). */
export const ITEM_CLASS_GROUP = {
  armor: "armor",
  weapon: "weapon",
  offHand: "off_hand",
  jewelry: "jewelry",
  cloak: "cloak",
  other: "other",
} as const;
export type ItemClassGroup = (typeof ITEM_CLASS_GROUP)[keyof typeof ITEM_CLASS_GROUP];
