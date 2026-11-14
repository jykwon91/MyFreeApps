import type { TaxRelevantOption } from "../types/transaction/TaxRelevantOption";

/** The choices of the "Tax" filter: whether a transaction is included in the tax report. */
export const TAX_RELEVANT_OPTIONS: readonly TaxRelevantOption[] = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];
