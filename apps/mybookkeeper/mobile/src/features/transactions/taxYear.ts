import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import { taxYearOf } from "@mybookkeeper/api-client/utils/transactionTaxYear";

/** The year a new date falls in, when it isn't the tax year the transaction is filed under. */
export function otherTaxYear(newDate: string, original: Transaction): number | null {
  const year = taxYearOf(newDate);
  return year === original.tax_year ? null : year;
}
