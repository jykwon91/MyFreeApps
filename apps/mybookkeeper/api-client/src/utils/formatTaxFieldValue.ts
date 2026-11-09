import { formatCurrency } from "@platform/core/utils/currency";
import { TAX_BOOLEAN_LABELS, TAX_FIELD_EMPTY_VALUE } from "../constants/taxFormFields";
import type { TaxFormField } from "../types/tax/TaxFormField";
import { maskTaxValue } from "./maskTaxValue";

/** A form field as it's read: money as dollars, yes or no, identifying numbers masked. */
export function formatTaxFieldValue(field: Pick<TaxFormField, "field_id" | "type" | "value">): string {
  if (field.value == null) return TAX_FIELD_EMPTY_VALUE;
  if (field.type === "numeric") return maskTaxValue(field.field_id, formatCurrency(field.value as number));
  if (field.type === "boolean") return field.value ? TAX_BOOLEAN_LABELS.yes : TAX_BOOLEAN_LABELS.no;
  return maskTaxValue(field.field_id, String(field.value));
}
