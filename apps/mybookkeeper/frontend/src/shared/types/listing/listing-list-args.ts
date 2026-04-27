import type { ListingStatus } from "./listing-status";

export interface ListingListArgs {
  status?: ListingStatus;
  limit?: number;
  offset?: number;
}
