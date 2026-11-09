/**
 * Keeps what a rate field can hold: digits and one decimal separator, at most two decimals.
 * A comma counts as the separator ("1200,50" is 1200.50). Anything else is dropped as it's typed,
 * and a second separator isn't taken: the field keeps what it had.
 */
export function rateInput(text: string, previous: string): string {
  const cleaned = text.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const [whole, fraction, ...extra] = cleaned.split(".");
  if (extra.length > 0) return previous;
  return fraction === undefined ? whole : `${whole}.${fraction.slice(0, 2)}`;
}

/** Whole days only. */
export function daysInput(text: string): string {
  return text.replace(/\D/g, "");
}
