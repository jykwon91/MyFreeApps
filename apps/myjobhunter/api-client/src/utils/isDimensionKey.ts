import { DIMENSION_KEY_ORDER } from "../constants/jobAnalysisDimensionKeys";
import type { DimensionKey } from "../types/job-analysis/dimension-key";

/** True for a key in the canonical rubric; the backend may send others as enums drift. */
export function isDimensionKey(key: string): key is DimensionKey {
  return DIMENSION_KEY_ORDER.some((known) => known === key);
}
