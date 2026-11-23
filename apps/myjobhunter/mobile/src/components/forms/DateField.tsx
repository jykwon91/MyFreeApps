import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { dateToIsoDate } from "../../lib/dateToIsoDate";
import { formatIsoDate } from "../../lib/formatIsoDate";
import { isoDateToDate } from "../../lib/isoDateToDate";
import type { DateFieldProps } from "../../types/DateFieldProps";
import DateTimePickerField from "./DateTimePickerField";

/** A calendar day, between `minimumDate` and `maximumDate` when they're given. */
export default function DateField({ label, value, onChange, minimumDate, maximumDate, required, error, disabled }: DateFieldProps) {
  const pickerDate = value ? isoDateToDate(value) : new Date();
  const earliest = minimumDate ? isoDateToDate(minimumDate) : undefined;
  const latest = maximumDate ? isoDateToDate(maximumDate) : undefined;
  const pick = (date: Date) => onChange(dateToIsoDate(date));
  return (
    <DateTimePickerField
      disabled={disabled}
      error={error}
      label={label}
      maximumDate={latest}
      minimumDate={earliest}
      mode="date"
      onClear={() => onChange("")}
      onPick={pick}
      openAndroid={() =>
        DateTimePickerAndroid.open({
          mode: "date",
          value: pickerDate,
          minimumDate: earliest,
          maximumDate: latest,
          onChange: (event, day) => {
            if (event.type === "set" && day) pick(day);
          },
        })
      }
      pickerDate={pickerDate}
      required={required}
      valueText={value ? formatIsoDate(value) : null}
    />
  );
}
