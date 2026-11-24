/** What the open accounts with a balance add up to, in one currency. */
export interface FinancialAccountTotals {
  currency: string;
  assets_cents: number;
  liabilities_cents: number;
  net_cents: number;
}
