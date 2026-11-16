import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import { localeDecimalSeparator } from "@platform/core/utils/localeDecimalSeparator";

/** The decimal separator of the browser's language, which typed amounts and minutes are read in. */
export function browserDecimalSeparator(): DecimalSeparator {
  return localeDecimalSeparator(navigator.language);
}
