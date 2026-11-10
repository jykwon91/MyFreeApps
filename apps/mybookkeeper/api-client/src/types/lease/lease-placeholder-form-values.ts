import type { LeasePlaceholderInputType } from "./lease-placeholder-input-type";

/** What the placeholder form holds: text fields stay strings, a blank default or expression means none. */
export interface LeasePlaceholderFormValues {
  display_label: string;
  input_type: LeasePlaceholderInputType;
  required: boolean;
  default_source: string;
  computed_expr: string;
}
