import { LoadingRegion, OptionSheet, SectionError, Skeleton } from "@platform/mobile";
import { useMemo, useState } from "react";
import { LEASE_IMPORT_MESSAGES as MESSAGES } from "../../constants/leaseImport";
import { pickerLoadError } from "../../lib/pickerLoadError";
import ListingChoicesFooter from "../listings/ListingChoicesFooter";
import { useListingChoices } from "../listings/useListingChoices";
import PickerField from "../transactions/PickerField";

interface LeaseListingFieldProps {
  value: string;
  onChange: (listingId: string) => void;
  disabled: boolean;
}

/** Which listing the lease is for, if any. The lease can be imported without one, so a failure to load doesn't block. */
export default function LeaseListingField({ value, onChange, disabled }: LeaseListingFieldProps) {
  const choices = useListingChoices();
  const { isLoading, hasData, error, refetch, loadMoreIfAny } = choices;
  const [isPicking, setIsPicking] = useState(false);
  const options = useMemo(() => [{ value: "", label: MESSAGES.listingNone }, ...choices.options], [choices.options]);

  if (isLoading) {
    return (
      <LoadingRegion label={MESSAGES.loadingListings}>
        <Skeleton height={56} />
      </LoadingRegion>
    );
  }
  if (!hasData) {
    const failure = pickerLoadError({ hasLoaded: false, error, refetch }, MESSAGES.listingsFailed);
    return failure ? <SectionError {...failure} /> : null;
  }
  if (choices.options.length === 0) return null;

  return (
    <>
      <PickerField
        label={MESSAGES.listing}
        onPress={() => {
          if (!disabled) setIsPicking(true);
        }}
        value={options.find((option) => option.value === value)?.label ?? MESSAGES.listingNone}
      />
      <OptionSheet
        footer={<ListingChoicesFooter choices={choices} />}
        isOpen={isPicking}
        onClose={() => setIsPicking(false)}
        onEndReached={loadMoreIfAny}
        onSelect={(listingId) => {
          setIsPicking(false);
          onChange(listingId);
        }}
        options={options}
        title={MESSAGES.listingSheetTitle}
        value={value}
      />
    </>
  );
}
