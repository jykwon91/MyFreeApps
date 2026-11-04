/** A rent payment as it appears in the ledger's payment list. */
export interface RentPayment {
  transaction_id: string;
  paid_on: string;
  amount: string;
  payer_name: string | null;
  payment_method: string | null;
  /** Not yet consumed by any charge — the tenant is paid ahead. */
  unapplied: string;
  /** Period labels this payment settled, e.g. ["August 2026"]. */
  applied_to: string[];
}
