/** The holdings shown, added up. Gain/loss covers only holdings with a cost basis. */
export interface HoldingTotals {
  value_cents: number;
  cost_basis_cents: number | null;
  gain_loss_cents: number | null;
  gain_loss_percent: number | null;
}
