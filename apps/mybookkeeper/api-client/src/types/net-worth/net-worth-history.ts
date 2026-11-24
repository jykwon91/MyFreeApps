import type { NetWorthHistoryPoint } from "./net-worth-history-point";
import type { NetWorthRange } from "./net-worth-range";

/** ``GET /net-worth/history``: one point per day, oldest first, ending today. */
export interface NetWorthHistory {
  range: NetWorthRange;
  currency: string;
  points: NetWorthHistoryPoint[];
}
