import { useDeleteListingPhotoMutation, useGetListingByIdQuery, useUpdateListingPhotoMutation } from "@mybookkeeper/api-client/store/listingsApi";
import type { ListingResponse } from "@mybookkeeper/api-client/types/listing/listing-response";
import { photoOrderChanges } from "@mybookkeeper/api-client/utils/listingPhotoOrder";
import { useToast } from "@platform/mobile";
import { useState } from "react";
import { LISTING_PHOTO_MESSAGES as MESSAGES, partialRemoveNote } from "../../constants/listingPhotos";
import { useWrite } from "../../lib/useWrite";
import { actionFailureCopy, deleteFailureCopy } from "../../lib/writeFailureCopy";

const DELETE_COPY = deleteFailureCopy("photo");
const ORDER_COPY = actionFailureCopy("change the order");

/** Removing and reordering a listing's photos. One at a time, in order: each is its own request. */
export function useListingPhotoActions(listing: ListingResponse) {
  const { showToast } = useToast();
  const { refetch } = useGetListingByIdQuery(listing.id);
  const [deletePhoto] = useDeleteListingPhotoMutation();
  const [updatePhoto] = useUpdateListingPhotoMutation();
  const removal = useWrite();
  const ordering = useWrite();
  const [partial, setPartial] = useState<string | null>(null);

  /** Stops at the first one that fails, and says how many went. */
  async function remove(photoIds: readonly string[]): Promise<boolean> {
    setPartial(null);
    let removed = 0;
    const result = await removal.run(async () => {
      for (const photoId of photoIds) {
        await deletePhoto({ listingId: listing.id, photoId }).unwrap();
        removed += 1;
      }
    });
    if (result === "done" || result === "gone") {
      showToast(result === "gone" ? MESSAGES.alreadyRemoved : photoIds.length === 1 ? MESSAGES.removed : MESSAGES.removedMany);
      return true;
    }
    if (result !== "busy" && removed > 0) setPartial(partialRemoveNote(removed, photoIds.length));
    return false;
  }

  /** Puts the photos in `orderedIds` order, sending only the ones whose place changed. */
  async function reorder(orderedIds: readonly string[]): Promise<boolean> {
    setPartial(null);
    const changes = photoOrderChanges(orderedIds, listing.photos);
    if (changes.length === 0) return true;
    const result = await ordering.run(async () => {
      for (const change of changes) {
        await updatePhoto({ listingId: listing.id, photoId: change.photoId, display_order: change.displayOrder }).unwrap();
      }
    });
    if (result === "done") {
      showToast(MESSAGES.moved);
      return true;
    }
    // Some of the moves may have gone through, so show what the server has.
    if (result !== "busy") void refetch();
    return false;
  }

  const failure = partial ?? (removal.failure ? DELETE_COPY[removal.failure] : null) ?? (ordering.failure ? ORDER_COPY[ordering.failure] : null);
  return { remove, reorder, isRemoving: removal.isBusy, isReordering: ordering.isBusy, failure };
}
