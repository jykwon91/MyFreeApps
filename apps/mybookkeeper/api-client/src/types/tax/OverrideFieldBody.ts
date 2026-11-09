/** Exactly one value column is sent, the one matching the field's reported type; null clears the value. */
export type OverrideFieldBody = { override_reason: string } & (
  | { value_numeric: number | null }
  | { value_boolean: boolean | null }
  | { value_text: string | null }
);
