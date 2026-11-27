/** Where the personal finances page links to. */
export const PERSONAL_FINANCES_LINKS = {
  financialAccounts: "/financial-accounts",
  cashFlow: "/cash-flow",
} as const;

/** Chart height, shared by the chart and its skeleton so nothing jumps on load. */
export const PERSONAL_FINANCES_CHART_HEIGHT = 300;

/** The same height as a class, for the skeleton. Kept literal so Tailwind sees it. */
export const PERSONAL_FINANCES_CHART_HEIGHT_CLASS = "h-[300px]";

/** Total income, total expenses, net, monthly average. The skeleton draws as many. */
export const PERSONAL_FINANCES_TILES = 4;
export const PERSONAL_FINANCES_TILES_GRID_CLASS = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4";

/** The income split and the categories sit side by side on a wide screen. */
export const PERSONAL_FINANCES_BREAKDOWN_GRID_CLASS = "grid grid-cols-1 gap-6 lg:grid-cols-2";

/** How many rows each breakdown's skeleton draws. */
export const PERSONAL_FINANCES_BREAKDOWN_SKELETON_ROWS = 4;

/** The year picker's value for no year: all of the bank history. */
export const PERSONAL_FINANCES_ALL_TIME = "all";
