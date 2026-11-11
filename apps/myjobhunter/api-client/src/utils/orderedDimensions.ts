import { DIMENSION_KEY_ORDER } from "../constants/jobAnalysisDimensionKeys";
import type { JobAnalysisDimension } from "../types/job-analysis/job-analysis-dimension";
import { isDimensionKey } from "./isDimensionKey";

/**
 * An analysis's dimensions in the rubric's order, whatever order they arrived in, with any the
 * client doesn't know yet appended at the end so a new backend dimension still shows.
 */
export function orderedDimensions(dimensions: readonly JobAnalysisDimension[]): JobAnalysisDimension[] {
  const lookup = new Map(dimensions.map((dimension) => [dimension.key, dimension]));
  const known = DIMENSION_KEY_ORDER.flatMap((key) => {
    const dimension = lookup.get(key);
    return dimension ? [dimension] : [];
  });
  return [...known, ...dimensions.filter((dimension) => !isDimensionKey(dimension.key))];
}
