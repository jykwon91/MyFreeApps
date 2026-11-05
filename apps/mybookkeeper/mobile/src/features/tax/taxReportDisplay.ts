import type { TaxSummaryResponse } from "@mybookkeeper/api-client/types/summary/TaxSummaryResponse";
import { NEUTRAL_CATEGORIES, NON_DEDUCTIBLE_CATEGORIES } from "@mybookkeeper/api-client/constants/taxCategories";
import { TAX_REPORT_MESSAGES as MESSAGES, TAX_YEARS_SHOWN, UNASSIGNED_PROPERTY_NAME, UNCATEGORIZED_CATEGORY } from "../../constants/taxReport";
import type { TaxCategoryRow } from "../../types/TaxCategoryRow";
import type { TaxExport } from "../../types/TaxExport";
import type { TaxPropertyRow } from "../../types/TaxPropertyRow";
import type { TaxRow } from "../../types/TaxRow";
import { categoryLabel } from "../transactions/transactionDisplay";

/** Adding zero turns -0 into 0, which would otherwise show as -$0.00. */
export function toCents(amount: number): number {
  return Math.round(amount * 100) + 0;
}

function categoryNote(category: string): string | null {
  if (NON_DEDUCTIBLE_CATEGORIES.includes(category)) return MESSAGES.notDeductible;
  if (NEUTRAL_CATEGORIES.includes(category)) return MESSAGES.notCounted;
  return null;
}

export function taxRowKey(row: TaxRow): string {
  return "category" in row ? row.category : row.id;
}

export function taxYears(today: Date): number[] {
  return Array.from({ length: TAX_YEARS_SHOWN }, (_, back) => today.getFullYear() - back);
}

export function categoryRows(summary: TaxSummaryResponse): TaxCategoryRow[] {
  return Object.entries(summary.by_category)
    .filter(([category]) => category !== UNCATEGORIZED_CATEGORY)
    .map(([category, amount]) => ({
      category,
      label: categoryLabel(category),
      cents: toCents(amount),
      note: categoryNote(category),
    }))
    .sort((a, b) => b.cents - a.cents);
}

export function propertyRows(summary: TaxSummaryResponse): TaxPropertyRow[] {
  return summary.by_property.map((property) => ({
    id: property.property_id,
    name: property.name ?? UNASSIGNED_PROPERTY_NAME,
    revenueCents: toCents(property.revenue),
    expensesCents: toCents(property.expenses),
    netCents: toCents(property.net_income),
  }));
}

export function uncategorizedCents(summary: TaxSummaryResponse): number {
  return toCents(summary.by_category[UNCATEGORIZED_CATEGORY] ?? 0);
}

export function hasTaxData(summary: TaxSummaryResponse): boolean {
  return Object.keys(summary.by_category).length > 0;
}

export function taxExports(year: number): TaxExport[] {
  return [
    { id: `tax-summary-${year}`, label: `Share ${year} tax summary PDF`, path: `/exports/tax-summary/${year}`, fileName: `tax_summary_${year}.pdf` },
    { id: `schedule-e-${year}`, label: `Share ${year} Schedule E PDF`, path: `/exports/schedule-e/${year}`, fileName: `schedule_e_${year}.pdf` },
  ];
}

/** A rate limit is the one failure that isn't helped by checking the connection. */
export function isExportLimitError(error: unknown): boolean {
  return error instanceof Error && /\b429\b/.test(error.message);
}
