import { MAX_TAX_RETURN_YEAR, MIN_TAX_RETURN_YEAR } from "../constants/taxReturnYears";
import type { Transaction } from "../types/transaction/transaction";

/** The tax year a "YYYY-MM-DD" date files under unless someone says otherwise: its calendar year. */
export function taxYearOf(isoDate: string): number {
  return Number(isoDate.slice(0, 4));
}

/** Whether a transaction can be filed under this tax year: the same years a tax return can cover. */
export function isAllowedTaxYear(year: number): boolean {
  return Number.isInteger(year) && year >= MIN_TAX_RETURN_YEAR && year <= MAX_TAX_RETURN_YEAR;
}

/** The year a new date falls in, when it isn't the tax year the transaction is filed under. */
export function otherTaxYear(newDate: string, original: Pick<Transaction, "tax_year">): number | null {
  const year = taxYearOf(newDate);
  return year === original.tax_year ? null : year;
}
