/** How a new list starts: the page's recommended picks, or empty rows. */
export const BIS_LIST_START = { recommended: "recommended", blank: "blank" } as const;

export type BisListStart = (typeof BIS_LIST_START)[keyof typeof BIS_LIST_START];

export const BIS_LIST_START_OPTIONS: readonly { id: BisListStart; label: string }[] = [
  { id: BIS_LIST_START.recommended, label: "Recommended picks" },
  { id: BIS_LIST_START.blank, label: "Empty" },
];
