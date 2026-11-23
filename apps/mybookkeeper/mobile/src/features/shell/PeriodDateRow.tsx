import { PickerField } from "@platform/mobile";
import { fullDateLabel } from "../../lib/localDate";
import DatePicker from "./DatePicker";

interface PeriodDateRowProps {
  label: string;
  value: string;
  minimum?: string;
  /** Read in the date's name; show it with a FieldError beside the row. */
  error?: string;
  /** Whether the calendar is folded open under the date; read as "expanded" or "collapsed". */
  isOpen: boolean;
  onToggle: () => void;
  onChange: (iso: string) => void;
}

/** A date that stays folded away until it's tapped, so the two calendars never fill the screen at once. */
export default function PeriodDateRow({ label, value, minimum, error, isOpen, onToggle, onChange }: PeriodDateRowProps) {
  return (
    <>
      <PickerField error={error} expanded={isOpen} label={label} onPress={onToggle} valueLabel={fullDateLabel(value)} />
      {isOpen ? <DatePicker label={label} minimum={minimum} onChange={onChange} value={value} /> : null}
    </>
  );
}
