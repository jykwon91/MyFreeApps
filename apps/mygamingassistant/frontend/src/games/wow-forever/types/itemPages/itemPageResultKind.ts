export const ITEM_PAGE_RESULT = { found: "found", unseen: "unseen", unknown: "unknown" } as const;
export type ItemPageResultKind = (typeof ITEM_PAGE_RESULT)[keyof typeof ITEM_PAGE_RESULT];
