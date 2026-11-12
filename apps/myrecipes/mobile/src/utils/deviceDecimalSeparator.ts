import type { DecimalSeparator } from "@myrecipes/api-client/types/recipe/decimal-separator";
import { localeDecimalSeparator } from "@myrecipes/api-client/utils/localeDecimalSeparator";

/**
 * The device locale's decimal separator, the one its decimal keypad offers. Hermes's default
 * Intl locale is the device's.
 */
export function deviceDecimalSeparator(): DecimalSeparator {
  return localeDecimalSeparator();
}
