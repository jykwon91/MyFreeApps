import { MASK_TOKEN_PATTERN } from "../constants/taxFormFields";

/** True for a value that was hidden for display, like ***1234; it is never the real value. */
export function isMaskedTaxValue(text: string): boolean {
  return MASK_TOKEN_PATTERN.test(text);
}
