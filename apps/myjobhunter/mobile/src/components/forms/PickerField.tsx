import DateTimePicker from "@react-native-community/datetimepicker";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Keyboard, Platform, Text, View } from "react-native";
import { DATE_TIME_FIELD_MESSAGES as MESSAGES } from "../../constants/dateTimeField";
import type { PickerFieldProps } from "../../types/PickerFieldProps";
import FieldError from "./FieldError";

/**
 * A date or date-and-time field. iOS spins it in place under a Done button; Android opens its own
 * dialog. The label and value show above Choose (or Change) and, when it isn't required, Clear.
 */
export default function PickerField({
  label,
  valueText,
  pickerDate,
  mode,
  minimumDate,
  onPick,
  onClear,
  openAndroid,
  required = false,
  error,
  disabled = false,
}: PickerFieldProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [isPicking, setIsPicking] = useState(false);
  const hasValue = valueText !== null;
  const action = isPicking ? MESSAGES.done : hasValue ? MESSAGES.change : MESSAGES.choose;

  // A save closes the picker, so it doesn't spring open again if the save fails.
  if (disabled && isPicking) setIsPicking(false);

  function press(): void {
    Keyboard.dismiss();
    if (Platform.OS !== "ios") {
      openAndroid();
      return;
    }
    // The spinner only reports a change, so Done on what it opened at has to count as choosing it.
    if (isPicking && !hasValue) onPick(pickerDate);
    setIsPicking(!isPicking);
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.xs, fontWeight: "500", color: colors.foreground }}>
        {label}
        {required ? <Text style={{ color: colors.destructiveText }}> *</Text> : null}
      </Text>
      <Text style={{ fontSize: fontSize.md, color: hasValue ? colors.foreground : colors.mutedForeground }}>{valueText ?? MESSAGES.notSet}</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <LoadingButton
          accessibilityLabel={`${isPicking ? MESSAGES.doneChoosing : action} ${label.toLowerCase()}`}
          disabled={disabled}
          onPress={press}
          style={{ flex: 1 }}
          variant="secondary"
        >
          {action}
        </LoadingButton>
        {hasValue && !required ? (
          <LoadingButton
            accessibilityLabel={`${MESSAGES.clear} ${label.toLowerCase()}`}
            disabled={disabled}
            onPress={() => {
              setIsPicking(false);
              onClear();
            }}
            style={{ flex: 1 }}
            variant="ghost"
          >
            {MESSAGES.clear}
          </LoadingButton>
        ) : null}
      </View>
      {isPicking ? (
        <DateTimePicker
          accentColor={colors.primary}
          accessibilityLabel={label}
          display="spinner"
          minimumDate={minimumDate}
          mode={mode}
          onChange={(_event, date) => {
            if (date) onPick(date);
          }}
          testID={`${label}-picker`}
          value={pickerDate}
        />
      ) : null}
      <FieldError message={error} />
    </View>
  );
}
