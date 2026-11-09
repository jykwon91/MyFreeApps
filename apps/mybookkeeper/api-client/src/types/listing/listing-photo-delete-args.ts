export interface ListingPhotoDeleteArgs {
  listingId: string;
  photoId: string;
  /** False inside a batch: the caller refreshes the listing once at the end instead of after each photo. */
  refresh?: boolean;
}
