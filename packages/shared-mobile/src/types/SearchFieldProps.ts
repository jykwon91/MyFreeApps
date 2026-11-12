export interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Called from the clear button. Most callers set `value` back to "". */
  onClear: () => void;
  placeholder: string;
  /** Says what's being searched, for example "Search recipes by title". */
  accessibilityLabel: string;
  /** Called from the keyboard's Search key, for a search that runs on demand. Leave out to only dismiss the keyboard. */
  onSubmit?: () => void;
  maxLength?: number;
  /** False while what's typed is being searched for, so it can't change under the search. Defaults to true. */
  editable?: boolean;
}
