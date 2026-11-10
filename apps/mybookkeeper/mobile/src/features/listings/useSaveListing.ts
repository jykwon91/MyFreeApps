import { useCreateListingMutation, useUpdateListingMutation } from "@mybookkeeper/api-client/store/listingsApi";
import type { ListingFormValues } from "@mybookkeeper/api-client/types/listing/listing-form-values";
import type { ListingResponse } from "@mybookkeeper/api-client/types/listing/listing-response";
import { formValuesToCreateRequest, formValuesToUpdateRequest, listingDirtyFields } from "@mybookkeeper/api-client/utils/listingForm";
import { useLeaveWhenSaved, useToast } from "@platform/mobile";
import { LISTING_FORM_MESSAGES } from "../../constants/listingForm";
import { useWrite } from "../../lib/useWrite";
import { saveFailureCopy } from "../../lib/writeFailureCopy";

/** Adds a listing, or saves only what changed since the form opened on `original`, and goes back when it's done. */
export function useSaveListing(original: ListingResponse | null) {
  const { showToast } = useToast();
  const [createListing] = useCreateListingMutation();
  const [updateListing] = useUpdateListingMutation();
  const write = useWrite();
  const { isLeaving, leave } = useLeaveWhenSaved("/listings");
  // A new listing is refused with 404 only when its property is gone.
  const copy = { ...saveFailureCopy("listing", "listings", original === null), ...(original === null ? { gone: LISTING_FORM_MESSAGES.propertyGone } : {}) };

  async function submit(values: ListingFormValues, started: ListingFormValues): Promise<void> {
    const dirty = original ? listingDirtyFields(values, started) : null;
    if (original && dirty && Object.keys(dirty).length === 0) {
      leave();
      return;
    }
    const result = await write.run(
      () =>
        original && dirty
          ? updateListing({ id: original.id, data: formValuesToUpdateRequest(values, dirty) }).unwrap()
          : createListing(formValuesToCreateRequest(values)).unwrap(),
      { staysLocked: true },
    );
    if (result !== "done") return;
    showToast(original ? LISTING_FORM_MESSAGES.saved : LISTING_FORM_MESSAGES.added);
    leave();
  }

  return { submit, isBusy: write.isBusy, isLeaving, failure: write.failure ? copy[write.failure] : null };
}
