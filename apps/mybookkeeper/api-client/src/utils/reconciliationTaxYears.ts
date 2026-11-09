import { RECONCILIATION_TAX_YEARS_OFFERED } from "../constants/reconciliationSourceTypes";

/** Last year and the ones before it: the years a 1099 can still be waiting on. */
export function reconciliationTaxYears(today: Date): number[] {
  return Array.from({ length: RECONCILIATION_TAX_YEARS_OFFERED }, (_, index) => today.getFullYear() - 1 - index);
}
