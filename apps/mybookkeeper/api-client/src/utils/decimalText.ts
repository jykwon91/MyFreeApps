import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";

const SPACES = /[\s\u00a0\u202f]/g;
const DIGITS = /^\d+$/;
const GROUPED = /^\d{1,3}(?:,\d{3})+$/;

/**
 * A typed share count or price as the canonical "1234.5678" the server reads:
 * "" when blank, undefined when it can't be read for sure. Unlike money, any
 * number of decimals is kept (the caller limits them). The keypad's own
 * separator starts the decimals; the other mark may group thousands in threes.
 * A leading "$" is dropped; a minus sign is unreadable.
 */
export function decimalText(text: string, decimalSeparator: DecimalSeparator): string | undefined {
  const body = text.replace(SPACES, "").replace(/^\$/, "");
  if (body === "") return "";
  const grouping = decimalSeparator === "." ? "," : ".";
  const parts = body.split(decimalSeparator);
  if (parts.length > 2) return undefined;
  const [rawWhole, fraction] = parts;
  const whole = rawWhole.split(grouping).join(",");
  let digits: string;
  if (whole === "") digits = "";
  else if (DIGITS.test(whole)) digits = whole;
  else if (GROUPED.test(whole)) digits = whole.replace(/,/g, "");
  else return undefined;
  if (fraction !== undefined && !DIGITS.test(fraction)) return undefined;
  if (digits === "" && fraction === undefined) return undefined;
  const normalized = digits.replace(/^0+(?=\d)/, "") || "0";
  return fraction === undefined ? normalized : `${normalized}.${fraction}`;
}

/** Digits after the point in a canonical decimal string. */
export function decimalPlaces(canonical: string): number {
  const point = canonical.indexOf(".");
  return point < 0 ? 0 : canonical.length - point - 1;
}
