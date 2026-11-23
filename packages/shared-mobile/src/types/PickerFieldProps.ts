export interface PickerFieldProps {
  label: string;
  /** What is chosen now, in words. */
  valueLabel: string;
  /** Opens the choices, e.g. an OptionSheet. */
  onPress: () => void;
  hint?: string;
  /** Read as part of the field's name and outlines the field; show the same message with a FieldError beside it. */
  error?: string;
  /** Draws a red asterisk after the visible label (hidden from screen readers) and reads ", required" in the field's name. */
  required?: boolean;
  /**
   * Only for a picker that folds content open in place under itself (an inline calendar, say): whether
   * that content is showing, read as "expanded" or "collapsed". Leave it out for a picker that opens a
   * sheet, so it isn't read as "collapsed".
   */
  expanded?: boolean;
  /** Dims the field and makes it read as unavailable; pass this rather than ignoring presses while busy. */
  disabled?: boolean;
}
