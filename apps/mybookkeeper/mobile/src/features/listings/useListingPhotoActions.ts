import { useDeleteListingPhotoMutation, useGetListingByIdQuery, useReorderListingPhotosMutation } from "@mybookkeeper/api-client/store/listingsApi";
import type { ListingResponse } from "@mybookkeeper/api-client/types/listing/listing-response";
import { writeFailure } from "@mybookkeeper/api-client/utils/writeFailure";
import { useToast } from "@platform/mobile";
import { useState } from "react";
import { LISTING_PHOTO_MESSAGES as MESSAGES, partialRemoveNote } from "../../constants/listingPhotos";
import { useWrite } from "../../lib/useWrite";
import { actionFailureCopy, deleteFailureCopy } from "../../lib/writeFailureCopy";

const DELETE_COPY = deleteFailureCopy("photo");
const ORDER_COPY = actionFailureCopy("change the order");

/** Removing and reordering a listing's photos. */
export function useListingPhotoActions(listing: ListingResponse) {
  const { showToast } = useToast();
  const { refetch, isFetching } = useGetListingByIdQuery(listing.id);
  const [deletePhoto] = useDeleteListingPhotoMutation();
  const [reorderPhotos] = useReorderListingPhotosMutation();
  const removal = useWrite();
  const ordering = useWrite();
  const [partial, setPartial] = useState<string | null>(null);

  /**
   * Tries every photo, one request each: one that fails doesn't keep the rest from going. A photo the
   * server no longer has counts as removed. Returns the ids that are still there (empty when all went),
   * or null when a removal was already under way and nothing was sent.
   */
  async function remove(photoIds: readonly string[]): Promise<string[] | null> {
    setPartial(null);
    const stillThere: string[] = [];
    let firstError: { error: unknown } | null = null;
    let missing = 0;
    const result = await removal.run(async () => {
      for (const photoId of photoIds) {
        try {
          await deletePhoto({ listingId: listing.id, photoId, refresh: false }).unwrap();
        } catch (error) {
          if (writeFailure(error) === "gone") {
            missing += 1;
          } else {
            stillThere.push(photoId);
            firstError ??= { error };
          }
        }
      }
      // One read of the listing for the whole batch, not one per photo.
      void refetch();
      if (firstError) throw firstError.error;
    });
    if (result === "busy") return null;
    if (result === "done") {
      showToast(missing === photoIds.length ? MESSAGES.alreadyRemoved : photoIds.length === 1 ? MESSAGES.removed : MESSAGES.removedMany);
    } else if (stillThere.length < photoIds.length) {
      setPartial(partialRemoveNote(photoIds.length - stillThere.length, photoIds.length));
    }
    return stillThere;
  }

  /** Puts the photos in `orderedIds` order. The server sets the whole order in one go, so it's never half done. */
  async function reorder(orderedIds: readonly string[]): Promise<boolean> {
    setPartial(null);
    const result = await ordering.run(() => reorderPhotos({ listingId: listing.id, photoIds: orderedIds }).unwrap());
    if (result === "done") showToast(MESSAGES.moved);
    return result === "done";
  }

  const failure =
    partial ??
    (removal.failure && removal.failure !== "gone" ? DELETE_COPY[removal.failure] : null) ??
    (ordering.failure ? ORDER_COPY[ordering.failure] : null);
  return { remove, reorder, isRemoving: removal.isBusy, isReordering: ordering.isBusy, isRefreshing: isFetching, failure };
}
