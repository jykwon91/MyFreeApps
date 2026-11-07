/** One line of the hub's hand-written "What's new on this site" list. */
export interface WhatsNewEntry {
  /** The day the change went live, `YYYY-MM-DD` (UTC). */
  date: string;
  title: string;
  /** One plain sentence for players. */
  summary: string;
  /**
   * Where the entry links. Its path (without the query) is the page whose
   * update dot the entry lights, so it must be a hub tile's path or the hub.
   */
  to: string;
}
