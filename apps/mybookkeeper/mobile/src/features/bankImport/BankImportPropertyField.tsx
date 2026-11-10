import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { LoadingButton, OptionSheet, Skeleton, useTheme } from "@platform/mobile";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { BANK_IMPORT_MESSAGES as MESSAGES } from "../../constants/bankImport";
import { NO_PROPERTY_OPTION } from "../../constants/transactionEdit";
import PickerField from "../transactions/PickerField";
import { selectableProperties } from "../transactions/transactionEditValues";

interface BankImportPropertyFieldProps {
  /** A property's id, or null to leave the rows without one. */
  value: string | null;
  onChange: (propertyId: string | null) => void;
  disabled: boolean;
}

/** Every imported row goes under this property. Importing without one is always allowed. */
export default function BankImportPropertyField({ value, onChange, disabled }: BankImportPropertyFieldProps) {
  const { colors, fontSize, spacing } = useTheme();
  const { currentData, error, isLoading, refetch } = useGetPropertiesQuery();
  const [isPicking, setIsPicking] = useState(false);
  const properties = useMemo(() => selectableProperties(currentData ?? [], value), [currentData, value]);

  if (isLoading) {
    return (
      <View accessible accessibilityLabel={MESSAGES.loadingProperties} accessibilityRole="progressbar">
        <Skeleton height={56} />
      </View>
    );
  }
  if (!currentData) {
    return (
      <View style={{ gap: spacing.sm }}>
        <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{error ? MESSAGES.propertiesFailed : MESSAGES.loadingProperties}</Text>
        <LoadingButton onPress={() => void refetch()} variant="secondary">
          {MESSAGES.tryAgain}
        </LoadingButton>
      </View>
    );
  }

  return (
    <>
      <PickerField
        disabled={disabled}
        label={MESSAGES.property}
        onPress={() => setIsPicking(true)}
        value={properties.find((property) => property.id === value)?.name ?? MESSAGES.noProperty}
      />
      <OptionSheet
        isOpen={isPicking}
        onClose={() => setIsPicking(false)}
        onSelect={(next) => {
          setIsPicking(false);
          onChange(next === NO_PROPERTY_OPTION ? null : next);
        }}
        options={[{ value: NO_PROPERTY_OPTION, label: MESSAGES.noProperty }, ...properties.map((property) => ({ value: property.id, label: property.name }))]}
        title={MESSAGES.propertySheetTitle}
        value={value ?? NO_PROPERTY_OPTION}
      />
    </>
  );
}
