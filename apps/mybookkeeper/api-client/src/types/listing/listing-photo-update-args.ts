export interface ListingPhotoUpdateArgs {
  listingId: string;
  photoId: string;
  caption?: string | null;
  display_order?: number;
}
