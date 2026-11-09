import { PII_FIELDS, SSN_PATTERN } from "../constants/taxFormFields";

/** Hides all but the last four characters of an identifying field, and any Social Security number in other text. */
export function maskTaxValue(fieldId: string, value: string): string {
  if (PII_FIELDS.has(fieldId)) {
    return value.length >= 4 ? "***" + value.slice(-4) : "****";
  }
  return value.replace(SSN_PATTERN, (match) => "***-**-" + match.slice(-4));
}
