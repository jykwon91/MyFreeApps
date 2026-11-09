/** Mirrors the override request limits in backend/app/schemas/tax/tax_form.py (value_numeric, value_text). */
export const TAX_FIELD_LIMITS = {
  /** value_numeric: max_digits=12 in all, decimal_places=2. */
  numericMaxDigits: 12,
  numericMaxDecimals: 2,
  /** value_text: max_length=500. */
  textMaxLength: 500,
} as const;
