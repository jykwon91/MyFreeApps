/** The bounded window after a refresh while fresh postings are plausibly still being scored. */
export interface ScoringWindow {
  isOpen: boolean;
  /** Milliseconds between polls of the inbox; 0 while the window is closed. */
  pollingInterval: number;
  /**
   * Opens (or restarts) the window: called when a refresh of this saved search added postings. A
   * refresh of a saved search the inbox is filtered away from leaves it as it is.
   */
  open: (refreshedSourceId: string) => void;
  /** Feeds in the inbox's latest unscored count: none left closes the window. */
  observe: (unscored: number | null) => void;
}
