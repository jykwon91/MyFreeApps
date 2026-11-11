export interface PickerFieldProps {
  label: string;
  /** The chosen value as people read it, or null when nothing is chosen. */
  valueText: string | null;
  /** Where the picker opens: the chosen value, or now. */
  pickerDate: Date;
  /** What the iOS spinner picks. */
  mode: "date" | "datetime";
  /** The earliest the iOS spinner offers; Android's dialog gets it from `openAndroid`. */
  minimumDate?: Date;
  onPick: (date: Date) => void;
  onClear: () => void;
  /** Opens Android's own dialog, or dialogs, for the value. */
  openAndroid: () => void;
  /** A required field can't be cleared. */
  required?: boolean;
  error?: string;
  /** Locks the buttons and closes the picker, for while the form is saving. */
  disabled?: boolean;
}
