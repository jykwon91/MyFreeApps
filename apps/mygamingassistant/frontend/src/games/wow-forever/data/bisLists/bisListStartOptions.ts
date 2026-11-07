/** How a new list starts: the page's recommended picks, or empty rows. */
export const BIS_LIST_START_OPTIONS = [
  { id: "recommended", label: "Recommended picks" },
  { id: "blank", label: "Empty" },
] as const;

export type BisListStart = (typeof BIS_LIST_START_OPTIONS)[number]["id"];
