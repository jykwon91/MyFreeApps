import { useGetListingsQuery } from "@mybookkeeper/api-client/store/listingsApi";
import { OptionSheet, Skeleton, useTheme } from "@platform/mobile";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { LEASE_IMPORT_CHOICE_LIMIT, LEASE_IMPORT_MESSAGES as MESSAGES } from "../../constants/leaseImport";
import PickerField from "../transactions/PickerField";

interface LeaseListingFieldProps {
  value: string;
  onChange: (listingId: string) => void;
  disabled: boolean;
}

/** Which listing the lease is for, if any. The lease can be imported without one, so a failure to load doesn't block. */
export default function LeaseListingField({ value, onChange, disabled }: LeaseListingFieldProps) {
  const { colors, fontSize } = useTheme();
  const { currentData, error, isLoading } = useGetListingsQuery({ limit: LEASE_IMPORT_CHOICE_LIMIT });
  const [isPicking, setIsPicking] = useState(false);
  const options = useMemo(
    () => [{ value: "", label: MESSAGES.listingNone }, ...(currentData?.items ?? []).map((listing) => ({ value: listing.id, label: listing.title }))],
    [currentData],
  );

  if (isLoading) {
    return (
      <View accessible accessibilityLabel={MESSAGES.loadingListings} accessibilityRole="progressbar">
        <Skeleton height={56} />
      </View>
    );
  }
  if (!currentData) return error ? <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{MESSAGES.listingsFailed}</Text> : null;
  if (currentData.items.length === 0) return null;

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
        isOpen={isPicking}
        onClose={() => setIsPicking(false)}
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
