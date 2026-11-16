/** Copy for picking several transactions on the Money tab, worded as the website words it. */
export const TRANSACTION_SELECTION_MESSAGES = {
  selectAll: "Select all",
  selectAllLabel: "Select every transaction that matches",
  selectingAll: "Selecting…",
  /** When "select all" couldn't fetch the matching rows that aren't loaded yet. */
  selectAllFailed: "I couldn't select every matching transaction. Try again.",
  /** When the ticks couldn't be checked after the list refreshed; they're cleared rather than kept unchecked. */
  checkFailed: "I couldn't check which selected transactions still match the filters, so I cleared the selection.",
  /** Shown in the selection bar while the ticks are checked after the list refreshed. */
  checking: "Checking selection…",
} as const;
