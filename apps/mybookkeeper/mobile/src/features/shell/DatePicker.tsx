import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Platform } from "react-native";
import { dateFromIso, fullDateLabel, isoFromDate } from "../../lib/localDate";

/** iOS shows a calendar in place. Android's calendar is a dialog, so a button opens it. */
export default function DatePicker({ label, minimum, onChange, value }: { label: string; minimum?: string; onChange: (iso: string) => void; value: string }) {
  const { colors } = useTheme();
  const minimumDate = minimum ? dateFromIso(minimum) : undefined;
  if (Platform.OS === "ios") {
    return (
      <DateTimePicker
        accentColor={colors.primary}
        accessibilityLabel={label}
        display="inline"
        minimumDate={minimumDate}
        mode="date"
        onChange={(_event, date) => {
          if (date) onChange(isoFromDate(date));
        }}
        testID="date-picker"
        value={dateFromIso(value)}
      />
    );
  }
  return (
    <LoadingButton
      accessibilityLabel={`${label}: ${fullDateLabel(value)}. Change date`}
      onPress={() =>
        DateTimePickerAndroid.open({
          minimumDate,
          mode: "date",
          onChange: (event, date) => {
            if (event.type === "set" && date) onChange(isoFromDate(date));
          },
          value: dateFromIso(value),
        })
      }
      variant="secondary"
    >
      {fullDateLabel(value)}
    </LoadingButton>
  );
}
