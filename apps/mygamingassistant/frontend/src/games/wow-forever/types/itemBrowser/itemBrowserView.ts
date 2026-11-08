/** The item browser's layout: rows or a grid of cards (the URL's `view` values). */
export const ITEM_BROWSER_VIEW = { list: "list", grid: "grid" } as const;
export type ItemBrowserView = (typeof ITEM_BROWSER_VIEW)[keyof typeof ITEM_BROWSER_VIEW];
