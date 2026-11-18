import { LoadingRegion, OptionSheet, Skeleton } from "@platform/mobile";
import { REVIEW_MESSAGES } from "../../constants/calendarReview";
import { PICKER_LOAD_MESSAGES } from "../../constants/pickerLoad";
import { pickerLoadError } from "../../lib/pickerLoadError";
import type { ReviewQueueListingSheetProps } from "../../types/ReviewQueueListingSheetProps";
import ListingChoicesFooter from "../listings/ListingChoicesFooter";
import { useListingChoices } from "../listings/useListingChoices";
import SheetEmptyAction from "../shell/SheetEmptyAction";

const SKELETON_HEIGHT = 56;

/** The listings a booking can be added to, every one of them. Only mounted for someone who can add bookings. */
export default function ReviewQueueListingSheet({ isOpen, description, onSelect, onClose, onClosed, onAddListing }: ReviewQueueListingSheetProps) {
  const choices = useListingChoices();
  const loadError = pickerLoadError({ hasLoaded: choices.hasData, error: choices.error, refetch: choices.refetch }, PICKER_LOAD_MESSAGES.listingsFailed);

  return (
    <OptionSheet
      description={description}
      emptyContent={
        choices.isLoading ? (
          <LoadingRegion label={PICKER_LOAD_MESSAGES.loadingListings}>
            <Skeleton height={SKELETON_HEIGHT} />
          </LoadingRegion>
        ) : (
          <SheetEmptyAction actionLabel={REVIEW_MESSAGES.addListing} message={REVIEW_MESSAGES.noListings} onPress={onAddListing} />
        )
      }
      footer={<ListingChoicesFooter choices={choices} />}
      isOpen={isOpen}
      loadError={loadError}
      onClose={onClose}
      onClosed={onClosed}
      onEndReached={choices.loadMoreIfAny}
      onSelect={onSelect}
      options={choices.options}
      title={REVIEW_MESSAGES.chooseListing}
      value=""
    />
  );
}
