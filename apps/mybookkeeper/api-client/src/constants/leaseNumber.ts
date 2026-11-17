import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";

/**
 * A number placeholder as a person writes it with each decimal mark: digits with an optional sign,
 * dollar sign, thousands grouped by the other mark and any decimals ("$1,500.50", "-12" with ".";
 * "1.500,50" with ","). The lease prints it as typed, so it is only checked, never converted.
 */
export const LEASE_NUMBER_PATTERNS: Readonly<Record<DecimalSeparator, RegExp>> = {
  ".": /^-?\$?(\d+|\d{1,3}(,\d{3})+)(\.\d+)?$/,
  ",": /^-?\$?(\d+|\d{1,3}(\.\d{3})+)(,\d+)?$/,
};
