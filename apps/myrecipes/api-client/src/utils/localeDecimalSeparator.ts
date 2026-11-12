import type { DecimalSeparator } from "../types/recipe/decimal-separator";

/**
 * The decimal separator for `locale` (the runtime's default when omitted). Uses
 * Intl.NumberFormat's format(), which Hermes supports on iOS and Android alike;
 * formatToParts() is Android-only there. Locales that write neither "," nor "."
 * read as ".".
 */
export function localeDecimalSeparator(locale?: string): DecimalSeparator {
  return new Intl.NumberFormat(locale).format(1.5).includes(",") ? "," : ".";
}
