export interface ListingPhoto {
  id: string;
  listing_id: string;
  storage_key: string;
  caption: string | null;
  display_order: number;
  created_at: string;
}
