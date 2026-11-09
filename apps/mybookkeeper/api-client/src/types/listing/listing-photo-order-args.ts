export interface ListingPhotoOrderArgs {
  listingId: string;
  /** Every photo of the listing, cover first. */
  photoIds: readonly string[];
}
