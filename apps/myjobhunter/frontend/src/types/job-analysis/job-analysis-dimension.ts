/**
 * Per-dimension verdict row.
 *
 * The backend rubric fixes the dimension list to five canonical keys
 * (skill_match, seniority, salary, location_remote, work_auth). Each
 * key has its own `status` enum — see DIMENSION_STATUS_LABELS for the
 * display copy and DIMENSION_STATUS_TONES for the badge color.
 *
 * `status` is intentionally typed as `string` here rather than a
 * union per key, because:
 *   1. The dimension key→status mapping is open-ended on the backend
 *      side (a new key may add new statuses).
 *   2. The renderer falls back to a neutral "—" for unknown statuses
 *      rather than crashing.
 */
export interface JobAnalysisDimension {
  key: string;
  status: string;
  rationale: string;
}

/** Canonical key order — matches the backend's _DIMENSION_KEYS tuple. */
export const DIMENSION_KEY_ORDER: readonly string[] = [
  "skill_match",
  "seniority",
  "salary",
  "location_remote",
  "work_auth",
] as const;

/** Display label per dimension key. */
export const DIMENSION_LABELS: Record<string, string> = {
  skill_match: "Skill match",
  seniority: "Seniority",
  salary: "Salary",
  location_remote: "Location & remote",
  work_auth: "Work authorization",
};

/**
 * Status-label and tone tables per dimension. The renderer reads these
 * to show "Strong" / "Below target" / "Compatible" labels with green /
 * yellow / red badges respectively.
 *
 * "Tone" maps directly to the @platform/ui Badge `color` prop:
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

export const DIMENSION_STATUS_LABELS: Record<string, string> = {
  // skill_match
  strong: "Strong",
  partial: "Partial",
  gap: "Gap",
  // seniority
  aligned: "Aligned",
  below: "Below",
  above: "Above",
  // salary
  above_target: "Above target",
  in_range: "In range",
  below_target: "Below target",
  not_disclosed: "Not disclosed",
  no_target: "No target set",
  // location_remote
  compatible: "Compatible",
  stretch: "Stretch",
  incompatible: "Incompatible",
  // work_auth (compatible / incompatible reused above)
  blocker: "Blocker",
  // shared
  unclear: "Unclear",
};

export const DIMENSION_STATUS_TONES: Record<string, DimensionTone> = {
  strong: "green",
  partial: "yellow",
  gap: "red",
  aligned: "green",
  below: "yellow",
  above: "blue",
  above_target: "green",
  in_range: "green",
  below_target: "red",
  not_disclosed: "gray",
  no_target: "gray",
  compatible: "green",
  stretch: "yellow",
  incompatible: "red",
  blocker: "red",
  unclear: "gray",
};
