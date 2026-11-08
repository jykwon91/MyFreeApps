/** Whether the Changes feed marks an item: changed from Classic Era, new in Forever, or neither. */
export const ITEM_CHANGE = { none: "none", changed: "changed", new: "new" } as const;
export type ItemChangeKind = (typeof ITEM_CHANGE)[keyof typeof ITEM_CHANGE];
