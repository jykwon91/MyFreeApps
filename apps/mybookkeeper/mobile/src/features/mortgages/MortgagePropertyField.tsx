import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { LoadingButton, OptionSheet, Skeleton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { MORTGAGE_FORM_MESSAGES as MESSAGES } from "../../constants/mortgageForm";
import PickerField from "../transactions/PickerField";

interface MortgagePropertyFieldProps {
  value: string;
  onChange: (propertyId: string) => void;
  error?: string;
  disabled: boolean;
}

export default function MortgagePropertyField({ value, onChange, error, disabled }: MortgagePropertyFieldProps) {
  const { colors, fontSize, spacing } = useTheme();
  const { data, error: loadError, isLoading } = useGetPropertiesQuery();
  const [isPicking, setIsPicking] = useState(false);
  const options = useMemo(
    () => [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((property) => ({ value: property.id, label: property.name })),
    [data],
  );

  if (isLoading) {
    return (
      <View accessible accessibilityLabel={MESSAGES.propertiesLoading} accessibilityRole="progressbar">
        <Skeleton height={56} />
      </View>
    );
  }
  if (loadError) {
    return <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{MESSAGES.propertiesFailed}</Text>;
  }
  if (options.length === 0) {
    return (
      <View style={{ gap: spacing.sm }}>
        <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{MESSAGES.noProperties}</Text>
        <LoadingButton onPress={() => router.push("/properties/new")} variant="secondary">
          {MESSAGES.addProperty}
        </LoadingButton>
      </View>
    );
  }
  const chosen = options.find((option) => option.value === value);
  return (
    <>
      <PickerField
        label={`${MESSAGES.property} *`}
        onPress={() => {
          if (!disabled) setIsPicking(true);
        }}
        value={chosen?.label ?? MESSAGES.propertyNone}
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ fontSize: fontSize.sm, color: colors.destructiveText }}>
          {error}
        </Text>
      ) : null}
      <OptionSheet
        isOpen={isPicking}
        onClose={() => setIsPicking(false)}
        onSelect={(propertyId) => {
          setIsPicking(false);
          onChange(propertyId);
        }}
        options={options}
        title={MESSAGES.propertySheetTitle}
        value={value}
      />
    </>
  );
}
