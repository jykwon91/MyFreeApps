import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";

/**
 * An `<input type="number">` value always uses "." whatever the browser's language, so web checks
 * shared with the phone apps read typed numbers that way; there is no device keypad to follow.
 */
export const NUMBER_INPUT_DECIMAL_SEPARATOR: DecimalSeparator = ".";
