import { dateToLocalDateTime } from "@myjobhunter/api-client/utils/interviewEventForm";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Keyboard, Platform, Text, View } from "react-native";
import { DATE_TIME_FIELD_MESSAGES as MESSAGES } from "../../constants/dateTimeField";
import { formatDateTime } from "../../lib/formatDateTime";
import type { DateTimeFieldProps } from "../../types/DateTimeFieldProps";
import FieldError from "./FieldError";

/**
 * A day and a time. iOS spins both in place under a Done button; Android has no
 * single dialog for both, so it asks for the day, then the time.
 */
export default function DateTimeField({ label, value, onChange, required = false, error, disabled = false }: DateTimeFieldProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [isPicking, setIsPicking] = useState(false);
  // A blank value is a local wall-clock string read back in local time.
  const pickerDate = value ? new Date(value) : new Date();
  const pick = (date: Date) => onChange(dateToLocalDateTime(date));
  const action = isPicking ? MESSAGES.done : value ? MESSAGES.change : MESSAGES.choose;

  function press(): void {
    Keyboard.dismiss();
    if (Platform.OS === "ios") {
      // The spinner only reports a change, so Done on the moment it opened at has to count as choosing it.
      if (isPicking && !value) pick(pickerDate);
      setIsPicking(!isPicking);
      return;
    }
    DateTimePickerAndroid.open({
      mode: "date",
      value: pickerDate,
      onChange: (dayEvent, day) => {
        if (dayEvent.type !== "set" || !day) return;
        DateTimePickerAndroid.open({
          mode: "time",
          value: day,
          onChange: (timeEvent, moment) => {
            if (timeEvent.type === "set" && moment) pick(moment);
          },
        });
      },
    });
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.xs, fontWeight: "500", color: colors.foreground }}>
        {label}
        {required ? <Text style={{ color: colors.destructiveText }}> *</Text> : null}
      </Text>
      <Text style={{ fontSize: fontSize.md, color: value ? colors.foreground : colors.mutedForeground }}>{value ? formatDateTime(value) : MESSAGES.notSet}</Text>
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
        {value && !required ? (
          <LoadingButton
            accessibilityLabel={`${MESSAGES.clear} ${label.toLowerCase()}`}
            disabled={disabled}
            onPress={() => {
              setIsPicking(false);
              onChange("");
            }}
            style={{ flex: 1 }}
            variant="ghost"
          >
            {MESSAGES.clear}
          </LoadingButton>
        ) : null}
      </View>
      {isPicking && !disabled ? (
        <DateTimePicker
          accentColor={colors.primary}
          accessibilityLabel={label}
          display="spinner"
          mode="datetime"
          onChange={(_event, date) => {
            if (date) pick(date);
          }}
          testID={`${label}-picker`}
          value={pickerDate}
        />
      ) : null}
      <FieldError message={error} />
    </View>
  );
}
