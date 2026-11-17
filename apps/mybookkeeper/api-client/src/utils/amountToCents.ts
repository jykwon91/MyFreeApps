/** A server amount ("10.50") as whole cents, so sums stay exact; text that isn't a number counts as zero. */
export function amountToCents(amount: string): number {
  const cents = Math.round(Number(amount) * 100);
  return Number.isFinite(cents) ? cents : 0;
}
