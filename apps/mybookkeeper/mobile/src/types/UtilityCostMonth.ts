import type { UtilityCostRow } from "./UtilityCostRow";

export interface UtilityCostMonth {
  period: string;
  cents: number;
  utilities: readonly UtilityCostRow[];
}
