/**
 * The per-IP limit on refreshes answers 429 with this generic detail (platform_shared's
 * RATE_LIMIT_GENERIC_DETAIL). A 429 with any other detail is JSearch's own quota, which says what
 * to do about it.
 */
export const RATE_LIMIT_GENERIC_DETAIL = "Too many attempts";

/** What the website and the phone say after a saved search is refreshed, or when it can't be. */
export const REFRESH_MESSAGES = {
  fetched: (fetched: number, created: number) => `Fetched ${fetched} posting${fetched === 1 ? "" : "s"} (${created} new)`,
  rateLimited: "You've refreshed a lot — try again in a few minutes",
  failed: "Refresh failed",
} as const;

/** The inbox's line on how much of it the AI has scored. */
export const COVERAGE_MESSAGES = {
  scored: (scored: number, total: number) => `Scored ${scored} of ${total}`,
  restAwait: " — the rest await the next daily scoring pass",
} as const;

/** A saved search's schedule line. */
export const CADENCE_MESSAGES = {
  lastFetched: (cadence: string, ago: string) => `Refreshes ${cadence.toLowerCase()} — last fetched ${ago}`,
  neverFetched: (cadence: string) => `Refreshes ${cadence.toLowerCase()} — never fetched yet`,
} as const;

/** What the website and the phone say after each Discovery action, or when it fails without a reason from the server. */
export const DISCOVER_ACTION_MESSAGES = {
  saved: "Saved",
  saveFailed: "Couldn't save this posting",
  promoted: "Added to Applications",
  promoteFailed: "Couldn't add this to Applications",
  dismissed: "Dismissed.",
  dismissFailed: "Couldn't dismiss this posting",
  undo: "Undo",
  undoing: "Undoing…",
  /** What Undo does, for screen readers. */
  undoHint: "Brings the posting back to your list",
  undone: "Posting brought back",
  undoFailed: "Couldn't undo dismiss",
  restore: "Restore",
  restoring: "Restoring…",
  /** What Restore does, for screen readers. */
  restoreHint: "Moves the posting back to your inbox",
  restored: "Posting restored to your inbox",
  restoreFailed: "Couldn't restore this posting",
  // undo-dismiss's 404 (Undo or Restore): brought back on another device, or expired/closed since.
  undoDismissGone: "This posting can no longer be brought back. It may already be in your inbox.",
  // Dismiss, Save or Restore's coded 409: the posting was already added to Applications (on another device, or a moment ago).
  alreadyApplied: "This posting is already in your Applications.",
  // Save or Restore's coded 409: a dismissed posting whose twin from another source is already in Discover.
  duplicate: "This posting is already in Discover from another source.",
  // Save or Restore's coded 409: that twin has since expired or closed.
  noLongerListed: "This posting is no longer listed.",
  removed: "Saved search removed",
  removeFailed: "Couldn't remove saved search",
  frequencyUpdated: "Refresh frequency updated",
  frequencyFailed: "Couldn't update refresh frequency",
  created: "Saved search created",
  createFailed: "Failed to create saved search",
  defaultsFailed: "Saved search created, but couldn't update your defaults",
  updated: "Saved search updated",
  updateFailed: "Couldn't update saved search",
} as const;

/** A dismissed posting's line in the Dismissed view: when, and why if the user said. */
export const DISMISSAL_MESSAGES = {
  dismissedAgo: (ago: string) => `Dismissed ${ago}`,
  withReason: (when: string, reason: string) => `${when} · ${reason}`,
} as const;
