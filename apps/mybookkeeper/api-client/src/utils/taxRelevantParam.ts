import type { TaxRelevantChoice } from "../types/transaction/TaxRelevantChoice";

/** The boolean the list's `tax_relevant` parameter takes for a "Tax" filter choice. */
export function taxRelevantParam(choice: TaxRelevantChoice): boolean {
  return choice === "true";
}
