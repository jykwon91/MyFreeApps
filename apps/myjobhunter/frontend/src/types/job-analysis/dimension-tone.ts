/**
 * Badge colour for a dimension status. Maps directly to the @platform/ui Badge
 * `color` prop:
 *   - green  — positive
 *   - blue   — neutral / informational (e.g. seniority above)
 *   - yellow — caution / stretch
 *   - red    — blocker / negative
 *   - gray   — unclear / unknown
 *
 * The `BadgeColor` union also has "orange" and "purple" but we don't
 * use them here.
 */
export type DimensionTone = "green" | "blue" | "yellow" | "red" | "gray";
