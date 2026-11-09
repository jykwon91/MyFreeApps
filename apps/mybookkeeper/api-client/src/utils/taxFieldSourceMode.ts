import type { FieldSourceMode } from "../types/tax/FieldSourceMode";
import type { TaxFormField } from "../types/tax/TaxFormField";

export function taxFieldSourceMode(field: Pick<TaxFormField, "is_calculated" | "is_overridden">): FieldSourceMode {
  if (field.is_calculated) return "calculated";
  if (field.is_overridden) return "overridden";
  return "sourced";
}
