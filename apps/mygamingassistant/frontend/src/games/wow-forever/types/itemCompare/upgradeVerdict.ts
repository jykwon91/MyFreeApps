/**
 * Is the hovered item better or worse than what it replaces, by the weighted score the Best gear
 * page uses? `pct` is the score change against what is worn; null when that scores 0.
 * `statsOnly`: procs, on-use effects or weapon damage couldn't be counted, so the verdict is by stats.
 * `bothHands`: a two-hander, judged against the main hand and off hand together.
 */
export interface UpgradeVerdict {
  kind: "upgrade" | "downgrade" | "same";
  pct: number | null;
  statsOnly: boolean;
  bothHands: boolean;
}
