import type { SelectableRef } from "./SelectableRef";

/** The ticked rows of a list that can tick rows not loaded, and what every one of them is known to match. */
export interface SelectionTicks<R extends SelectableRef> {
  refs: Readonly<Record<string, R>>;
  /**
   * The check key the rows were last checked against (the filters, and how many times the rows
   * have been refetched since, for edits), or null when some may not match: those wait for a
   * check before any bulk action.
   */
  checkKey: string | null;
}
