import { formatSendTime } from "@mybookkeeper/api-client/utils/rentReminderFormat";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Keyboard, Platform, Text, View } from "react-native";

function dateFromTime(time: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(2000, 0, 1, hour, minute);
}

function timeFromDate(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** A time of day as "HH:MM". iOS spins in place under a Done button; Android opens its clock dialog. */
export default function TimeField({ error, label, onChange, value }: { error?: string; label: string; onChange: (time: string) => void; value: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const [isPicking, setIsPicking] = useState(false);

  function pick(): void {
    Keyboard.dismiss();
    if (Platform.OS === "ios") {
      setIsPicking(!isPicking);
      return;
    }
    DateTimePickerAndroid.open({
      is24Hour: false,
      mode: "time",
      onChange: (event, date) => {
        if (event.type === "set" && date) onChange(timeFromDate(date));
      },
      value: dateFromTime(value),
    });
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.sm, fontWeight: "500", color: colors.foreground }}>{label}</Text>
      <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{formatSendTime(value)}</Text>
      <LoadingButton accessibilityLabel={`${isPicking ? "Done choosing" : "Change"} ${label.toLowerCase()}`} onPress={pick} variant="secondary">
        {isPicking ? "Done" : "Change"}
      </LoadingButton>
      {isPicking ? (
        <DateTimePicker
          accessibilityLabel={label}
          display="spinner"
          mode="time"
          onChange={(_event, date) => {
            if (date) onChange(timeFromDate(date));
          }}
          testID={`${label}-picker`}
          value={dateFromTime(value)}
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
