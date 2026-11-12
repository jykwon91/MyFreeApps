import type { DecimalSeparator } from "@myrecipes/api-client/types/recipe/decimal-separator";
import { localeDecimalSeparator } from "@myrecipes/api-client/utils/localeDecimalSeparator";

/** The decimal separator of the browser's language, which typed amounts and minutes are read in. */
export function browserDecimalSeparator(): DecimalSeparator {
  return localeDecimalSeparator(navigator.language);
}
