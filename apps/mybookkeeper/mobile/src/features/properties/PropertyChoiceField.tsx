import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { FieldError, LoadingButton, LoadingRegion, OptionSheet, PickerField, SectionError, Skeleton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { pickerLoadError } from "../../lib/pickerLoadError";
import type { PropertyChoiceMessages } from "../../types/PropertyChoiceMessages";

interface PropertyChoiceFieldProps {
  messages: PropertyChoiceMessages;
  value: string;
  onChange: (propertyId: string) => void;
  error?: string;
  disabled: boolean;
}

export default function PropertyChoiceField({ messages: MESSAGES, value, onChange, error, disabled }: PropertyChoiceFieldProps) {
  const { colors, fontSize, spacing } = useTheme();
  const { data, error: loadError, isLoading, refetch } = useGetPropertiesQuery();
  const [isPicking, setIsPicking] = useState(false);
  const options = useMemo(
    () => [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((property) => ({ value: property.id, label: property.name })),
    [data],
  );

  if (isLoading) {
    return (
      <LoadingRegion label={MESSAGES.propertiesLoading}>
        <Skeleton height={56} />
      </LoadingRegion>
    );
  }
  const failure = pickerLoadError({ hasLoaded: data !== undefined, error: loadError, refetch }, MESSAGES.propertiesFailed);
  if (failure) return <SectionError {...failure} />;
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
        disabled={disabled}
        error={error}
        label={MESSAGES.property}
        onPress={() => setIsPicking(true)}
        required
        valueLabel={chosen?.label ?? MESSAGES.propertyNone}
      />
      <FieldError message={error} name={MESSAGES.property} />
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
