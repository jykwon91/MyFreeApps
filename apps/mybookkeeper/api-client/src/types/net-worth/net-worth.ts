import type { NetWorthGroup } from "./net-worth-group";

/** ``GET /net-worth``: today's total and every line behind it. */
export interface NetWorth {
  currency: string;
  as_of: string;
  assets_cents: number;
  liabilities_cents: number;
  net_cents: number;
  /** Display order, empty groups left out. Empty means nothing to show yet. */
  groups: NetWorthGroup[];
}
