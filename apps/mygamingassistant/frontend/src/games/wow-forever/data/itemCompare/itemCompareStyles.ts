/** Width of each column of the compare tooltip (the item's stats; the equipped gear). */
export const ITEM_COMPARE_COLUMN_WIDTH = "w-72 max-w-full sm:w-80";

/** The equipped column: its blocks stacked. */
export const ITEM_COMPARE_COLUMN = `${ITEM_COMPARE_COLUMN_WIDTH} space-y-2`;

/** Red for what swapping loses (green is the game's equip colour, `EQUIP_TEXT`). */
export const ITEM_COMPARE_LOSS_TEXT = "text-red-700 dark:text-red-400";

/** A muted line in an equipped block. */
export const ITEM_COMPARE_MUTED_LINE = "text-muted-foreground";

/** The verdict line's colour and arrow (the arrow is decoration; the words carry the meaning; "about the same" has none). */
export const VERDICT_STYLES = {
  upgrade: { text: "text-green-700 dark:text-green-400", arrow: "▲" },
  downgrade: { text: ITEM_COMPARE_LOSS_TEXT, arrow: "▼" },
  same: { text: ITEM_COMPARE_MUTED_LINE, arrow: null },
} as const;

/** The can't-use warning: amber, not red (it isn't an error). */
export const ITEM_COMPARE_WARNING = "rounded-xl border border-amber-500/40 bg-card p-3 text-sm text-amber-800 dark:text-amber-300";
