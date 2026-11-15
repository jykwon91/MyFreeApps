/** When the rows for the current page, filters and order couldn't be loaded. */
export const TRANSACTIONS_LOAD_FAILED = "I couldn't load your transactions. Want me to try again?";

/** When "select all" couldn't fetch the matching rows of the other pages. */
export const SELECT_ALL_FAILED = "I couldn't select every matching transaction. Try again.";

/** Read by screen readers while "select all" fetches the matching rows. */
export const SELECTING_ALL_LABEL = "Selecting all matching transactions";

/** When the ticked rows couldn't be checked against new filters; the ticks are cleared rather than kept unchecked. */
export const SELECTION_CHECK_FAILED = "I couldn't check which selected transactions still match the filters, so I cleared the selection.";

/** Shown in the bulk bar while the ticked rows are checked against new filters. */
export const CHECKING_SELECTION_LABEL = "Checking selection...";
