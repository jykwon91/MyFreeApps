import type { DIMENSION_KEY_ORDER } from "../../constants/jobAnalysisDimensionKeys";

/** One of the five dimension keys the backend rubric emits today. */
export type DimensionKey = (typeof DIMENSION_KEY_ORDER)[number];
