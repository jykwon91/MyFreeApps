/** Recipes per GET /recipes page. The server caps a page at 200. */
export const RECIPES_PAGE_SIZE = 50;

/** The first page has no cursor: it starts at the most recently updated recipe. */
export const FIRST_RECIPES_CURSOR = null;
