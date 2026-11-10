/**
 * Per-dimension verdict row.
 *
 * The backend rubric fixes the dimension list to five canonical keys
 * (skill_match, seniority, salary, location_remote, work_auth). Each
 * key has its own `status` enum — see DIMENSION_STATUS_LABELS (constants/jobAnalysisDimensionStatusLabels)
 * for the display copy; the web app picks badge colours.
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
