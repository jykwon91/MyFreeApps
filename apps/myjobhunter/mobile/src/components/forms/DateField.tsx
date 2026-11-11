import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { dateToIsoDate } from "../../lib/dateToIsoDate";
import { formatIsoDate } from "../../lib/formatIsoDate";
import { isoDateToDate } from "../../lib/isoDateToDate";
import type { DateFieldProps } from "../../types/DateFieldProps";
import PickerField from "./PickerField";

/** A calendar day, no earlier than `minimumDate` when one is given. */
export default function DateField({ label, value, onChange, minimumDate, required, error, disabled }: DateFieldProps) {
  const pickerDate = value ? isoDateToDate(value) : new Date();
  const earliest = minimumDate ? isoDateToDate(minimumDate) : undefined;
  const pick = (date: Date) => onChange(dateToIsoDate(date));
  return (
    <PickerField
      disabled={disabled}
      error={error}
      label={label}
      minimumDate={earliest}
      mode="date"
      onClear={() => onChange("")}
      onPick={pick}
      openAndroid={() =>
        DateTimePickerAndroid.open({
          mode: "date",
          value: pickerDate,
          minimumDate: earliest,
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
