/** A value for one field, tied to the field's type so it can only go in the matching column. Null clears it. */
export type TaxFieldOverrideValue =
  | { field_type: "numeric"; value: number | null }
  | { field_type: "boolean"; value: boolean | null }
  | { field_type: "text"; value: string | null };
