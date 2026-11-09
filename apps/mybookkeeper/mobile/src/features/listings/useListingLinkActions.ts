import { useDeleteListingExternalIdMutation } from "@mybookkeeper/api-client/store/listingsApi";
import type { ListingExternalId } from "@mybookkeeper/api-client/types/listing/listing-external-id";
import { useToast } from "@platform/mobile";
import { LISTING_LINK_MESSAGES } from "../../constants/listingLinks";
import { useWrite } from "../../lib/useWrite";
import { deleteFailureCopy } from "../../lib/writeFailureCopy";

const COPY = deleteFailureCopy("link");

export function useListingLinkActions(link: ListingExternalId) {
  const { showToast } = useToast();
  const [deleteLink] = useDeleteListingExternalIdMutation();
  const removal = useWrite();

  async function remove(): Promise<void> {
    const result = await removal.run(() => deleteLink({ listingId: link.listing_id, externalIdPk: link.id }).unwrap());
    if (result === "done") showToast(LISTING_LINK_MESSAGES.removed);
    if (result === "gone") showToast(LISTING_LINK_MESSAGES.alreadyRemoved);
  }

  return { remove, isRemoving: removal.isBusy, failure: removal.failure && removal.failure !== "gone" ? COPY[removal.failure] : null };
}
