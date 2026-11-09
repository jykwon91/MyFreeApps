import type { BlackoutSummary } from "./blackout-summary";

/** Response shape for POST /calendar/review-queue/{id}/resolve (Phase 2b). */
export interface ResolveQueueItemResponse {
  queue_item_id: string;
  blackout: BlackoutSummary;
}
