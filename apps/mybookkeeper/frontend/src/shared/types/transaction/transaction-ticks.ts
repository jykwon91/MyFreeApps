import type { TransactionSelectionRef } from "@mybookkeeper/api-client/types/transaction/TransactionSelectionRef";

/** The ticked rows of the transactions table, and what every one of them is known to match. */
export interface TransactionTicks {
  refs: Readonly<Record<string, TransactionSelectionRef>>;
  /**
   * The check key the rows were last checked against (the filters, and how many times the rows
   * have been refetched since, for edits), or null when some may not match: those wait for a
   * check before any bulk action.
   */
  checkKey: string | null;
}
