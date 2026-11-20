import { DEPRECIATION_INPUT_MESSAGES as MESSAGES } from "@mybookkeeper/api-client/constants/depreciationInputs";
import { FormField, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import OptionalDateField from "../shell/OptionalDateField";

/** A rental's land value and date placed in service, which its Form 4562 depreciation is computed from. */
export default function DepreciationFields({
  disabled,
  landValue,
  landValueError,
  onLandValueChange,
  onPlacedInServiceChange,
  placedInService,
  placedInServiceError,
}: {
  disabled: boolean;
  landValue: string;
  landValueError: string | undefined;
  onLandValueChange: (text: string) => void;
  onPlacedInServiceChange: (iso: string | null) => void;
  placedInService: string | null;
  placedInServiceError: string | undefined;
}) {
  const { colors, fontSize, spacing } = useTheme();

  return (
    <View style={{ gap: spacing.lg }}>
      <FormField
        editable={!disabled}
        error={landValueError}
        hint={MESSAGES.landValueHint}
        inputMode="decimal"
        keyboardType="decimal-pad"
        label={MESSAGES.landValue}
        onChangeText={onLandValueChange}
        placeholder={MESSAGES.landValuePlaceholder}
        returnKeyType="done"
        value={landValue}
      />
      <OptionalDateField
        disabled={disabled}
        error={placedInServiceError}
        label={MESSAGES.placedInService}
        maximumDate={new Date()}
        onChange={onPlacedInServiceChange}
        startsAt={new Date()}
        value={placedInService}
      />
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground, marginTop: -spacing.sm }}>
        {MESSAGES.placedInServiceHint}
      </Text>
    </View>
  );
}
