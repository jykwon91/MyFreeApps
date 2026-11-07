/** Which "What's new" entries this browser has seen, for the update dots (entries named by `entryKey`). */
export interface PageVisits {
  /** Every entry that already existed on this browser's first WoW Forever visit: those never get a dot. */
  baseline: readonly string[];
  /** Per page path, the entries for that page that existed when it was last opened. */
  pages: Readonly<Record<string, readonly string[]>>;
}
