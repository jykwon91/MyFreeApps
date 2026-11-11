/** A choice and the words it is shown with. */
export interface LabelledOption<Value extends string> {
  value: Value;
  label: string;
}
