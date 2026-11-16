import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import { localeDecimalSeparator } from "@platform/core/utils/localeDecimalSeparator";

/**
 * The device locale's decimal separator, the one its decimal keypad offers. Hermes's default
 * Intl locale is the device's.
 */
export function deviceDecimalSeparator(): DecimalSeparator {
  return localeDecimalSeparator();
}
