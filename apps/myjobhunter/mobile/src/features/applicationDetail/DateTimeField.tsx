import { dateToLocalDateTime } from "@myjobhunter/api-client/utils/interviewEventForm";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { formatDateTime } from "../../lib/formatDateTime";
import type { DateTimeFieldProps } from "../../types/DateTimeFieldProps";
import PickerField from "../../components/forms/PickerField";

/** A day and a time. Android has no single dialog for both, so it asks for the day, then the time. */
export default function DateTimeField({ label, value, onChange, required, error, disabled }: DateTimeFieldProps) {
  // A blank value is a local wall-clock string read back in local time.
  const pickerDate = value ? new Date(value) : new Date();
  const pick = (date: Date) => onChange(dateToLocalDateTime(date));
  return (
    <PickerField
      disabled={disabled}
      error={error}
      label={label}
      mode="datetime"
      onClear={() => onChange("")}
      onPick={pick}
      openAndroid={() =>
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
        })
      }
      pickerDate={pickerDate}
      required={required}
      valueText={value ? formatDateTime(value) : null}
    />
  );
}
