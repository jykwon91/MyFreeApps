/** One grid for the header and every row, so the columns line up on sm+; on a phone each row is a card. */
export const AUCTION_ROW_GRID = "grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_6rem]";

/** A row's look: a bordered card on a phone, a ruled table row on sm+. */
export const AUCTION_ROW_LOOK = "rounded-xl border bg-card p-3 sm:rounded-none sm:border-0 sm:border-b sm:bg-transparent sm:py-1";
