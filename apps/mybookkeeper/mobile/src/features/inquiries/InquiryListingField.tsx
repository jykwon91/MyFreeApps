import { INQUIRY_FORM_LABELS as LABELS } from "@mybookkeeper/api-client/constants/inquiryForm";
import { useGetListingsQuery } from "@mybookkeeper/api-client/store/listingsApi";
import { LoadingRegion, SectionError, Skeleton } from "@platform/mobile";
import { useMemo } from "react";
import { INQUIRY_CREATE_MESSAGES as MESSAGES, INQUIRY_LISTING_CHOICE_LIMIT } from "../../constants/inquiryCreate";
import { pickerLoadError } from "../../lib/pickerLoadError";
import type { InquiryListingFieldProps } from "../../types/InquiryListingFieldProps";
import InquiryChoiceGroup from "./InquiryChoiceGroup";

const SKELETON_HEIGHT = 56;

/** Which listing they asked about, if any. Linking is optional, so a failure to load doesn't block adding. */
export default function InquiryListingField({ value, onChange, disabled }: InquiryListingFieldProps) {
  const { currentData, error, isLoading, refetch } = useGetListingsQuery({ limit: INQUIRY_LISTING_CHOICE_LIMIT });
  const choices = useMemo(
    () => [{ value: "", label: LABELS.noListing }, ...(currentData?.items ?? []).map((listing) => ({ value: listing.id, label: listing.title }))],
    [currentData],
  );

  if (isLoading) {
    return (
      <LoadingRegion label={MESSAGES.loadingListings}>
        <Skeleton height={SKELETON_HEIGHT} />
      </LoadingRegion>
    );
  }
  if (!currentData) {
    const failure = pickerLoadError({ hasLoaded: false, error, refetch }, MESSAGES.listingsFailed);
    return failure ? <SectionError {...failure} /> : null;
  }
  if (currentData.items.length === 0) return null;
  return <InquiryChoiceGroup choices={choices} disabled={disabled} label={LABELS.listing} onSelect={onChange} value={value} />;
}
