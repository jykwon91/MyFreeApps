export interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Called from the clear button. Most callers set `value` back to "". */
  onClear: () => void;
  placeholder: string;
  /** Says what's being searched, for example "Search recipes by title". */
  accessibilityLabel: string;
}
