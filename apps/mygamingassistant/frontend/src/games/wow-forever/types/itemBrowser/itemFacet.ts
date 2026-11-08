/** The chip groups that show a count per option. */
export const ITEM_FACET = { quality: "quality", group: "group", slot: "slot", type: "type", change: "change" } as const;
export type ItemFacet = (typeof ITEM_FACET)[keyof typeof ITEM_FACET];
