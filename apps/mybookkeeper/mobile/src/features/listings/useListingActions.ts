import { useDeleteListingMutation, useUpdateListingMutation } from "@mybookkeeper/api-client/store/listingsApi";
import type { ListingResponse } from "@mybookkeeper/api-client/types/listing/listing-response";
import type { ListingStatus } from "@mybookkeeper/api-client/types/listing/listing-status";
import { useToast } from "@platform/mobile";
import { LISTING_MESSAGES } from "../../constants/listings";
import { useWrite } from "../../lib/useWrite";
import { deleteFailureCopy, saveFailureCopy } from "../../lib/writeFailureCopy";

const SAVE_COPY = saveFailureCopy("listing", "listings", false);
const DELETE_COPY = deleteFailureCopy("listing");

/** The quick changes on a listing's own screen: set its status, or delete it. */
export function useListingActions(listing: ListingResponse, onDeleted: () => void) {
  const { showToast } = useToast();
  const [updateListing] = useUpdateListingMutation();
  const [deleteListing] = useDeleteListingMutation();
  const statusChange = useWrite();
  const removal = useWrite();

  async function setStatus(status: ListingStatus): Promise<void> {
    if (status === listing.status) return;
    const result = await statusChange.run(() => updateListing({ id: listing.id, data: { status } }).unwrap());
    if (result === "done") showToast(LISTING_MESSAGES.statusChanged);
  }

  async function remove(): Promise<void> {
    const result = await removal.run(() => deleteListing(listing.id).unwrap(), { staysLocked: true });
    if (result !== "done" && result !== "gone") return;
    onDeleted();
    showToast(result === "done" ? LISTING_MESSAGES.deleted : LISTING_MESSAGES.alreadyDeleted);
  }

  const failure = statusChange.failure ? SAVE_COPY[statusChange.failure] : removal.failure && removal.failure !== "gone" ? DELETE_COPY[removal.failure] : null;
  return { setStatus, remove, isChangingStatus: statusChange.isBusy, isDeleting: removal.isBusy, failure };
}
