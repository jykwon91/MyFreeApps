import type { ExtractionSnapshot } from "./extraction-snapshot";

export interface ExtractionObservation {
  snapshot: ExtractionSnapshot;
  /** True when extraction work finished since the previous snapshot. */
  completed: boolean;
}
