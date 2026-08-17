/**
 * What the rate-watch section is currently showing.
 *
 * `idle` is the pre-search state — the check reaches out to the Texas
 * Department of Insurance, so it runs when asked rather than on page load.
 */
export type RateWatchMode =
  | "idle"
  | "loading"
  | "error"
  | "empty"
  | "results";
