/** A URL value as a positive whole number ("47" → 47); null for anything else ("", "0", "4.5", "abc"). */
export function positiveWholeNumber(raw: string | null): number | null {
  if (raw === null || !/^[1-9]\d*$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}
