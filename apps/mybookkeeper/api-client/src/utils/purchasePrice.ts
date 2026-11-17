/** Numeric(12, 2) on the server: anything at or above this doesn't fit. */
const PURCHASE_PRICE_LIMIT = 10_000_000_000;

/**
 * Typed purchase price ("$250,000") as the decimal string the API takes
 * ("250000.00"), or null when blank or not a positive amount that fits.
 */
export function cleanPurchasePrice(text: string): string | null {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0 || value >= PURCHASE_PRICE_LIMIT) return null;
  return value.toFixed(2);
}
