/** A write that waits a few seconds (so it can be undone) before it runs. */
export interface DelayedAction {
  /** One pending action per id; scheduling the same id again replaces it. */
  id: string;
  /** What the collapsed card / undo bar says, e.g. "Approved: Alchemy leveling route". */
  label: string;
  /** The toast once it's saved. */
  successMessage: string | null;
  run: () => Promise<void>;
}
