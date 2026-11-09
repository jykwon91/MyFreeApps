import type { ListingPhoto } from "@mybookkeeper/api-client/types/listing/listing-photo";

/** The server leaves the address out, or says so, when the file can't be fetched. */
export function photoUrl(photo: ListingPhoto): string | null {
  return photo.is_available === false ? null : (photo.presigned_url ?? null);
}
