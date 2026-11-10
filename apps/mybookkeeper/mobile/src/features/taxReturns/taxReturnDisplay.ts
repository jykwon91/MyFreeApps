import { VALIDATION_SEVERITY_ORDER } from "@mybookkeeper/api-client/constants/validationSeverityOrder";
import type { TaxReturn } from "@mybookkeeper/api-client/types/tax/TaxReturn";
import type { ValidationResult } from "@mybookkeeper/api-client/types/tax/ValidationResult";
import type { WebPath } from "@platform/mobile";
import { TAX_RETURNS_MESSAGES as MESSAGES } from "../../constants/taxReturns";

/** Two returns can share a year when their jurisdictions differ, so anything but federal says which. */
export function taxReturnTitle(taxReturn: TaxReturn): string {
  const title = MESSAGES.title(taxReturn.tax_year);
  return taxReturn.jurisdiction === "federal" ? title : `${title} · ${taxReturn.jurisdiction}`;
}

export function byYearNewestFirst(returns: readonly TaxReturn[]): TaxReturn[] {
  return [...returns].sort((a, b) => b.tax_year - a.tax_year || a.jurisdiction.localeCompare(b.jurisdiction));
}

export function bySeverity(results: readonly ValidationResult[]): ValidationResult[] {
  return [...results].sort((a, b) => VALIDATION_SEVERITY_ORDER.indexOf(a.severity) - VALIDATION_SEVERITY_ORDER.indexOf(b.severity));
}

export function taxReturnWebPath(id: string): WebPath {
  return `/tax-returns/${id}`;
}
