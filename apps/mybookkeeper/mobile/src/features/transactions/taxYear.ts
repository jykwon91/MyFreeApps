import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";

export function taxYearOf(isoDate: string): number {
  return Number(isoDate.slice(0, 4));
}

/** The year a new date falls in, when it isn't the tax year the transaction is filed under. */
export function otherTaxYear(newDate: string, original: Transaction): number | null {
  const year = taxYearOf(newDate);
  return year === original.tax_year ? null : year;
}
