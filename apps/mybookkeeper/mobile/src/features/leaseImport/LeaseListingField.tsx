import { LoadingRegion, OptionSheet, PickerField, SectionError, Skeleton } from "@platform/mobile";
import { PICKER_LOAD_MESSAGES } from "../../constants/pickerLoad";
import { useMemo, useState } from "react";
import { LEASE_IMPORT_MESSAGES as MESSAGES } from "../../constants/leaseImport";
import { pickerLoadError } from "../../lib/pickerLoadError";
import PagedChoicesFooter from "../shell/PagedChoicesFooter";
import { useListingChoices } from "../listings/useListingChoices";

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
        disabled={disabled}
        label={MESSAGES.listing}
        onPress={() => setIsPicking(true)}
        valueLabel={options.find((option) => option.value === value)?.label ?? MESSAGES.listingNone}
      />
      <OptionSheet
        footer={<PagedChoicesFooter choices={choices} loadingLabel={PICKER_LOAD_MESSAGES.loadingMoreListings} />}
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
