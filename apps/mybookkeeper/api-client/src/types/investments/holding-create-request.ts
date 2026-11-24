import type { SecurityType } from "./security-type";

/** Add a holding by hand to an investment account not synced from a bank. */
export interface HoldingCreateRequest {
  financial_account_id: string;
  ticker_symbol: string | null;
  name: string | null;
  security_type: SecurityType;
  /** Decimal strings, as typed. */
  quantity: string;
  price: string;
  cost_basis_cents: number | null;
}
