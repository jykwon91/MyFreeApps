export interface ResolveQueueItemRequest {
  listing_id: string;
}

export interface IgnoreQueueItemRequest {
  source_listing_id: string;
  reason?: string;
}
