import type { SecurityType } from "./security-type";

/** How much of the holdings shown is in one security type. */
export interface HoldingAllocation {
  security_type: SecurityType;
  value_cents: number;
  /** Of the total shown; null when that total isn't positive. */
  percent: number | null;
}
