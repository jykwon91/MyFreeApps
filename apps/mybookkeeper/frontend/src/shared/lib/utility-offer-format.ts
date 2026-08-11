/**
 * Display formatting for market offers.
 *
 * Kept apart from `utility-plan-format` because these describe an offer the
 * operator does not hold yet — the vocabulary is "would save", not "is paying".
 */

/** "$619/yr" — whole dollars, because the cents are false precision here. */
export function formatAnnualSaving(cents: number | null): string {
  if (cents === null) return "—";
  return `$${Math.round(cents / 100).toLocaleString()}/yr`;
}

/** "10.50¢" — the offer's price at the 1,000 kWh disclosure point. */
export function formatOfferRate(value: string): string {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return "—";
  return `${parsed.toFixed(2)}¢`;
}

/**
 * The exit fee in words.
 *
 * An unpublished fee reads as "not published", never as "$0" — those are
 * different facts and only one of them is good news.
 */
export function formatCancellationFee(
  cents: number | null,
  isPerRemainingMonth: boolean,
): string {
  if (cents === null) return "Exit fee not published";
  if (cents === 0) return "No exit fee";
  const dollars = `$${Math.round(cents / 100).toLocaleString()}`;
  if (isPerRemainingMonth) return `${dollars} per month left`;
  return `${dollars} exit fee`;
}

/** "3/5" — or "Unrated" when the feed has nothing on file. */
export function formatProviderRating(rating: number | null): string {
  if (rating === null) return "Unrated";
  return `${rating}/5`;
}

/** "12 months" / "1 month". */
export function formatTerm(months: number): string {
  return months === 1 ? "1 month" : `${months} months`;
}
