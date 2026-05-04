/** Summary of the newly created blackout returned by the resolve endpoint. */
export interface BlackoutSummary {
  id: string;
  listing_id: string;
  starts_on: string;
  ends_on: string;
  source: string;
}

/** Response shape for POST /calendar/review-queue/{id}/resolve (Phase 2b). */
export interface ResolveQueueItemResponse {
  queue_item_id: string;
  blackout: BlackoutSummary;
}
