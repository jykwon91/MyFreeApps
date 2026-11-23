import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { LoadingRegion, OptionSheet, PickerField, SectionError, Skeleton } from "@platform/mobile";
import { useMemo, useState } from "react";
import { BANK_IMPORT_MESSAGES as MESSAGES } from "../../constants/bankImport";
import { NONE_OPTION_VALUE } from "../../constants/transactionEdit";
import { pickerLoadError } from "../../lib/pickerLoadError";
import { selectableProperties } from "../transactions/transactionEditValues";

interface BankImportPropertyFieldProps {
  /** A property's id, or null to leave the rows without one. */
  value: string | null;
  onChange: (propertyId: string | null) => void;
  disabled: boolean;
}

/** Every imported row goes under this property. Importing without one is always allowed. */
export default function BankImportPropertyField({ value, onChange, disabled }: BankImportPropertyFieldProps) {
  const { currentData, error, isLoading, refetch } = useGetPropertiesQuery();
  const [isPicking, setIsPicking] = useState(false);
  const properties = useMemo(() => selectableProperties(currentData ?? [], value), [currentData, value]);

  const failure = pickerLoadError({ hasLoaded: currentData !== undefined, error, refetch }, MESSAGES.propertiesFailed);
  if (failure) return <SectionError {...failure} />;
  if (isLoading || !currentData) {
    return (
      <LoadingRegion label={MESSAGES.loadingProperties}>
        <Skeleton height={56} />
      </LoadingRegion>
    );
  }
  return (
    <>
      <PickerField
        disabled={disabled}
        label={MESSAGES.property}
        onPress={() => setIsPicking(true)}
        valueLabel={properties.find((property) => property.id === value)?.name ?? MESSAGES.noProperty}
      />
      <OptionSheet
        isOpen={isPicking}
        onClose={() => setIsPicking(false)}
        onSelect={(next) => {
          setIsPicking(false);
          onChange(next === NONE_OPTION_VALUE ? null : next);
        }}
        options={[{ value: NONE_OPTION_VALUE, label: MESSAGES.noProperty }, ...properties.map((property) => ({ value: property.id, label: property.name }))]}
        title={MESSAGES.propertySheetTitle}
        value={value ?? NONE_OPTION_VALUE}
      />
    </>
  );
}
