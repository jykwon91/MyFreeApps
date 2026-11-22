import type { TaxReturn } from "../types/tax/TaxReturn";

/** Every tax year that has a return, newest first, once each. */
export function taxReturnYears(returns: readonly Pick<TaxReturn, "tax_year">[]): number[] {
  return [...new Set(returns.map((taxReturn) => taxReturn.tax_year))].sort((a, b) => b - a);
}
