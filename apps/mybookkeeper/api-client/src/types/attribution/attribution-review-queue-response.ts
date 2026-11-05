import type { AttributionReviewItem } from "./attribution-review-item";

export interface AttributionReviewQueueResponse {
  items: AttributionReviewItem[];
  total: number;
  pending_count: number;
}
