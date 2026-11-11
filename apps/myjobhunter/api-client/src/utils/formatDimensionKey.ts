import { DIMENSION_LABELS } from "../constants/jobAnalysisDimensionLabels";
import { isDimensionKey } from "./isDimensionKey";

/** A dimension's name, as in "Skill match"; the raw key for one added on the backend after this build. */
export function formatDimensionKey(key: string): string {
  return isDimensionKey(key) ? DIMENSION_LABELS[key] : key;
}
