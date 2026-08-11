/**
 * What the better-plans section is currently showing.
 *
 * `idle` is the pre-search state — the search fans out to an external feed, so
 * it runs when asked rather than on page load.
 */
export type BetterPlansMode =
  | "idle"
  | "loading"
  | "error"
  | "empty"
  | "results";
