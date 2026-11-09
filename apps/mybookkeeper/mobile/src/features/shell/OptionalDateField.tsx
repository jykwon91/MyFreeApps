import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Keyboard, Platform, Text, View } from "react-native";
import { dateFromIso, fullDateLabel, isoFromDate } from "../../lib/localDate";

/** Blank stays blank: a date only counts once it's been picked, so nothing wrong gets saved by accident. */
export default function OptionalDateField({
  disabled = false,
  error,
  label,
  maximumDate,
  onChange,
  required = false,
  startsAt,
  value,
}: {
  /** Locks the buttons and closes the picker, for while the form is saving or leaving. */
  disabled?: boolean;
  error?: string;
  label: string;
  maximumDate?: Date;
  onChange: (iso: string | null) => void;
  required?: boolean;
  startsAt: Date;
  value: string | null;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const [isPicking, setIsPicking] = useState(false);
  const pickerDate = value ? dateFromIso(value) : startsAt;

  function pick(): void {
    Keyboard.dismiss();
    if (Platform.OS === "ios") {
      // The spinner only reports a change, so Done on the date it opened at has to count as choosing it.
      if (isPicking && !value) onChange(isoFromDate(startsAt));
      setIsPicking(!isPicking);
      return;
    }
    DateTimePickerAndroid.open({
      maximumDate,
      mode: "date",
      onChange: (event, date) => {
        if (event.type === "set" && date) onChange(isoFromDate(date));
      },
      value: pickerDate,
    });
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.sm, fontWeight: "500", color: colors.foreground }}>
        {label}
        {required ? <Text style={{ color: colors.destructiveText }}> *</Text> : null}
      </Text>
      <Text style={{ fontSize: fontSize.md, color: value ? colors.foreground : colors.mutedForeground }}>{value ? fullDateLabel(value) : "Not set"}</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <LoadingButton accessibilityLabel={`${isPicking ? "Done choosing" : value ? "Change" : "Choose"} ${label.toLowerCase()}`} disabled={disabled} onPress={pick} style={{ flex: 1 }} variant="secondary">
          {isPicking ? "Done" : value ? "Change" : "Choose"}
        </LoadingButton>
        {value ? (
          <LoadingButton
            accessibilityLabel={`Clear ${label.toLowerCase()}`}
            disabled={disabled}
            onPress={() => {
              setIsPicking(false);
              onChange(null);
            }}
            style={{ flex: 1 }}
            variant="ghost"
          >
            Clear
          </LoadingButton>
        ) : null}
      </View>
      {isPicking && !disabled ? (
        <DateTimePicker
          accessibilityLabel={label}
          display="spinner"
          maximumDate={maximumDate}
          mode="date"
          onChange={(_event, date) => {
            if (date) onChange(isoFromDate(date));
          }}
          testID={`${label}-picker`}
          value={pickerDate}
        />
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={{ fontSize: fontSize.sm, color: colors.destructiveText }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
