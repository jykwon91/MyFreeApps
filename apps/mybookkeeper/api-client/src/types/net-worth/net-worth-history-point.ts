export interface NetWorthHistoryPoint {
  /** A date-only ISO string. */
  day: string;
  assets_cents: number;
  liabilities_cents: number;
  net_cents: number;
}
