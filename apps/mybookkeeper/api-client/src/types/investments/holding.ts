import type { SecurityType } from "./security-type";

/**
 * One holding as ``GET /holdings`` returns it. Quantity and price are decimal
 * strings so a fractional share or a four-decimal fund price is never rounded
 * on the way; value, cost basis and gain/loss are cents.
 */
export interface Holding {
  id: string;
  financial_account_id: string;
  account_name: string;
  /** Typed in by the person (editable) rather than synced from a bank. */
  is_manual: boolean;
  security_id: string;
  ticker_symbol: string | null;
  name: string | null;
  security_type: SecurityType;
  quantity: string | null;
  price: string | null;
  price_as_of: string | null;
  is_price_stale: boolean;
  value_cents: number | null;
  cost_basis_cents: number | null;
  gain_loss_cents: number | null;
  gain_loss_percent: number | null;
  currency: string;
}
