import type { ListingPhoto } from "../types/listing/listing-photo";
import type { ListingPhotoOrderChange } from "../types/listing/listing-photo-order-change";

/** Cover first: the photo with the lowest `display_order` is the cover. */
export function sortPhotos(photos: readonly ListingPhoto[]): ListingPhoto[] {
  return [...photos].sort((a, b) => a.display_order - b.display_order);
}

export function moveId(ids: readonly string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return [...ids];
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** The photos whose stored position is no longer their place in `orderedIds`. */
export function photoOrderChanges(orderedIds: readonly string[], photos: readonly ListingPhoto[]): ListingPhotoOrderChange[] {
  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  const changes: ListingPhotoOrderChange[] = [];
  orderedIds.forEach((photoId, index) => {
    const photo = byId.get(photoId);
    if (photo && photo.display_order !== index) changes.push({ photoId, displayOrder: index });
  });
  return changes;
}
