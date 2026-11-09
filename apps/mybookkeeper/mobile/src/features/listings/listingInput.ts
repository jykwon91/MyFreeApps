/** Keeps what a rate field can hold: digits and one point, at most two decimals. Anything else is dropped as it's typed. */
export function rateInput(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length === 0 ? whole : `${whole}.${rest.join("").slice(0, 2)}`;
}

/** Whole days only. */
export function daysInput(text: string): string {
  return text.replace(/\D/g, "");
}
