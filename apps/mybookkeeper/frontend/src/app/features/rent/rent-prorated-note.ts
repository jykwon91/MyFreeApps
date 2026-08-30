import { formatCurrency } from "@/shared/utils/currency";

/**
 * Why this period costs less than the schedule says.
 *
 * A tenant who moves in on the 15th owes half a month, and the charge shows
 * $822.58 against a $1,500 schedule. Without saying so, that reads as a bug or
 * a shortfall; the backend sends the undivided amount precisely so the number
 * can explain itself. Returns null for a whole period, which needs no note.
 */
export function proratedNote(fullAmount: string | null): string | null {
  if (!fullAmount) return null;
  return `Prorated from ${formatCurrency(fullAmount)} for a partial month`;
}
