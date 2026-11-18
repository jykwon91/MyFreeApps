export interface RentalRoiCostLine {
  /** A transaction category, or `mortgage_principal` / `mortgage_interest` / `mortgage_escrow`. */
  category: string;
  monthly_cents: number;
  /** Null when a loan record states the amount rather than an average of transactions. */
  window_total_cents: number | null;
}
