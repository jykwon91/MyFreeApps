/**
 * One dwelling-line rate filing a Texas carrier made with the Department of
 * Insurance.
 *
 * `is_in_force` and `is_pending` are both false for a filing that was withdrawn
 * or rejected — it closed without ever applying. The UI must never present one
 * of those as a coming increase.
 */
export interface InsuranceRateFiling {
  serff_id: string;
  company_name: string;
  product_name: string | null;
  /** Positive is an increase, negative a decrease, null if unstated. */
  percent_change: number | null;
  filed_date: string | null;
  /** When the new rate reaches renewing policies — the date that matters. */
  effective_date_renewal: string | null;
  is_in_force: boolean;
  is_pending: boolean;
}
