import { useCreateListingExternalIdMutation, useUpdateListingExternalIdMutation } from "@mybookkeeper/api-client/store/listingsApi";
import type { ListingExternalId } from "@mybookkeeper/api-client/types/listing/listing-external-id";
import type { ListingSource } from "@mybookkeeper/api-client/types/listing/listing-source";
import { externalIdChanged, externalIdFormToRequest } from "@mybookkeeper/api-client/utils/externalIdForm";
import { useToast } from "@platform/mobile";
import { LISTING_LINK_MESSAGES } from "../../constants/listingLinks";
import { useLeaveWhenSaved } from "../../lib/useLeaveWhenSaved";
import { useWrite } from "../../lib/useWrite";
import { saveFailureCopy } from "../../lib/writeFailureCopy";

/** Adds a link to another site, or saves `original`, and goes back when it's done. */
export function useSaveListingLink(listingId: string, original: ListingExternalId | null) {
  const { showToast } = useToast();
  const [createLink] = useCreateListingExternalIdMutation();
  const [updateLink] = useUpdateListingExternalIdMutation();
  const write = useWrite();
  const { isLeaving, leave } = useLeaveWhenSaved(`/listings/${listingId}/links`);
  const copy = { ...saveFailureCopy("link", "links", original === null), conflict: LISTING_LINK_MESSAGES.conflict };

  async function submit(source: ListingSource, externalId: string, externalUrl: string): Promise<void> {
    if (original && !externalIdChanged(original, externalId, externalUrl)) {
      leave();
      return;
    }
    const body = externalIdFormToRequest(externalId, externalUrl);
    const result = await write.run(
      () =>
        original
          ? updateLink({ listingId, externalIdPk: original.id, data: body }).unwrap()
          : createLink({ listingId, data: { source, ...body } }).unwrap(),
      { staysLocked: true },
    );
    if (result !== "done") return;
    showToast(original ? LISTING_LINK_MESSAGES.saved : LISTING_LINK_MESSAGES.added);
    leave();
  }

  return { submit, isBusy: write.isBusy, isLeaving, failure: write.failure ? copy[write.failure] : null };
}
