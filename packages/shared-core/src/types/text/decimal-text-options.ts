/** How normalizeDecimalText reads a typed decimal beyond the keypad's own mark. */
export interface DecimalTextOptions {
  /**
   * Most digits kept after the mark. Zeros past it are dropped ("2.500" → "2.50" for two); any
   * other digit past it makes the text unreadable rather than rounded. Leave out to read any number.
   */
  maxDecimals?: number;
  /**
   * Read only the keypad's own mark, so "1.500" typed on a decimal-comma phone is refused rather
   * than read as 1.5. Leave off for small values the server sends back with "." (a rate, a GPA),
   * so a form prefilled with "7.125" still saves on a decimal-comma phone.
   */
  keypadMarkOnly?: boolean;
}
