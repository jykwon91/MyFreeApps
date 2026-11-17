import { normalizeDecimalText } from "@platform/core/utils/normalizeDecimalText";
import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import { EDUCATION_GPA_MAX_DECIMALS } from "../constants/profileFieldLimits";

/**
 * A typed GPA as the "3.85" the server reads: "" when blank, undefined when it can't be read.
 * Read with the keypad's decimal mark or "." (how the server sends it back, so a prefilled "3.80"
 * still saves on a decimal-comma phone).
 */
export function normalizeGpa(text: string, decimalSeparator: DecimalSeparator): string | undefined {
  return normalizeDecimalText(text, decimalSeparator, { maxDecimals: EDUCATION_GPA_MAX_DECIMALS });
}
