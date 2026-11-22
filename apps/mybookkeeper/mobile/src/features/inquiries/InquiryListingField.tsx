import { INQUIRY_FORM_LABELS as LABELS } from "@mybookkeeper/api-client/constants/inquiryForm";
import { PICKER_LOAD_MESSAGES } from "../../constants/pickerLoad";
import { ChoiceGroup, LoadingButton, LoadingRegion, SectionError, Skeleton } from "@platform/mobile";
import { useMemo } from "react";
import { View } from "react-native";
import { INQUIRY_CREATE_MESSAGES as MESSAGES } from "../../constants/inquiryCreate";
import { canLoadMore } from "../../lib/canLoadMore";
import { pickerLoadError } from "../../lib/pickerLoadError";
import type { InquiryListingFieldProps } from "../../types/InquiryListingFieldProps";
import PagedChoicesFooter from "../shell/PagedChoicesFooter";
import { useListingChoices } from "../listings/useListingChoices";

const SKELETON_HEIGHT = 56;

/** Which listing they asked about, if any. Linking is optional, so a failure to load doesn't block adding. */
export default function InquiryListingField({ value, onChange, disabled }: InquiryListingFieldProps) {
  const choices = useListingChoices();
  const { options, isLoading, hasData, error, refetch, loadMore } = choices;
  const choicesWithNone = useMemo(() => [{ value: "", label: LABELS.noListing }, ...options], [options]);

  if (isLoading) {
    return (
      <LoadingRegion label={MESSAGES.loadingListings}>
        <Skeleton height={SKELETON_HEIGHT} />
      </LoadingRegion>
    );
  }
  if (!hasData) {
    const failure = pickerLoadError({ hasLoaded: false, error, refetch }, MESSAGES.listingsFailed);
    return failure ? <SectionError {...failure} /> : null;
  }
  if (options.length === 0) return null;
  return (
    <View>
      <ChoiceGroup disabled={disabled} label={LABELS.listing} onChange={onChange} options={choicesWithNone} value={value} />
      <PagedChoicesFooter choices={choices} loadingLabel={PICKER_LOAD_MESSAGES.loadingMoreListings} />
      {canLoadMore(choices) ? (
        <LoadingButton disabled={disabled} onPress={loadMore} variant="secondary">
          {MESSAGES.showMoreListings}
        </LoadingButton>
      ) : null}
    </View>
  );
}
