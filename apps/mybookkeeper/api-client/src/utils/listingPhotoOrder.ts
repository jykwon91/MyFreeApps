import type { ListingPhoto } from "../types/listing/listing-photo";

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
