import { fullDateLabel } from "../../lib/localDate";
import DatePicker from "./DatePicker";
import PickerField from "../transactions/PickerField";

interface PeriodDateRowProps {
  label: string;
  value: string;
  minimum?: string;
  /** Read as the hint on the date; show it with a FieldError beside the row. */
  error?: string;
  isOpen: boolean;
  onToggle: () => void;
  onChange: (iso: string) => void;
}

/** A date that stays folded away until it's tapped, so the two calendars never fill the screen at once. */
export default function PeriodDateRow({ label, value, minimum, error, isOpen, onToggle, onChange }: PeriodDateRowProps) {
  return (
    <>
      <PickerField error={error} label={label} onPress={onToggle} value={fullDateLabel(value)} />
      {isOpen ? <DatePicker label={label} minimum={minimum} onChange={onChange} value={value} /> : null}
    </>
  );
}
