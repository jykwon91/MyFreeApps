import type { UsageUnit } from "@mybookkeeper/api-client/types/transaction/UsageUnit";

export type { UsageUnit };

/** Short label for display next to a quantity. */
export const USAGE_UNIT_LABELS: Record<UsageUnit, string> = {
  kwh: "kWh",
  therm: "therms",
  ccf: "CCF",
  mcf: "MCF",
  gallon: "gal",
  kgal: "kgal",
};
