/** The guild page's "Who can craft this?" search (GET /api/wow/guilds/{slug}/recipes?q=). */

/** The URL param holding the search, so a search can be shared or survive Back. */
export const RECIPE_SEARCH_PARAM = "recipe";
/** The backend's limits (``GUILD_RECIPE_QUERY_MIN_LENGTH`` / ``_MAX_LENGTH``). */
export const RECIPE_QUERY_MIN_LENGTH = 2;
export const RECIPE_QUERY_MAX_LENGTH = 60;
/** How the search box waits before searching. */
export const RECIPE_SEARCH_DEBOUNCE_MS = 300;
/** Placeholder rows while a search runs. */
export const RECIPE_SKELETON_ROWS = 3;
export const RECIPE_SEARCH_PROBLEM = "Couldn't search the guild's recipes.";
/** How many crafters a recipe card lists before the rest are folded away (the list is sorted best first). */
export const RECIPE_CRAFTERS_VISIBLE = 1;
export const RECIPE_CRAFTERS_COLLAPSE_LABEL = "Show fewer";
