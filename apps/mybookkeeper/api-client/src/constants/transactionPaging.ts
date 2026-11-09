export const TRANSACTION_PAGE_SIZE = 50;
/** The most rows the server hands back in one list. A drill-down asks for this many so its total is not cut short. */
export const TRANSACTION_LIST_LIMIT = 5000;
/** Shown above a drill-down whose list reached the limit, so a total that may be short says so. */
export const DRILL_DOWN_TRUNCATED_MESSAGE = "That's the most I can load at once, so there may be more than this.";
