/** One grid for the header and every row, so the columns line up from lg up; below that each row is a card. */
export const WRIT_ROW_GRID =
  "grid grid-cols-1 gap-x-3 gap-y-2 lg:grid-cols-[minmax(0,1.5fr)_6rem_6.5rem_minmax(0,1.5fr)_6.5rem_8.5rem_minmax(0,1.2fr)] lg:items-center";

/** A row's look: a bordered card on a phone, a ruled table row from lg up. */
export const WRIT_ROW_LOOK = "rounded-xl border bg-card p-3 lg:rounded-none lg:border-0 lg:border-b lg:bg-transparent lg:px-2 lg:py-1";

/** A deal: a soft green tint and a 3px green edge (the tint works on light and dark cards). */
export const WRIT_DEAL_LOOK = "border-l-[3px] border-l-emerald-600 bg-emerald-500/10 dark:border-l-emerald-400 lg:border-l-[3px] lg:bg-emerald-500/10";
