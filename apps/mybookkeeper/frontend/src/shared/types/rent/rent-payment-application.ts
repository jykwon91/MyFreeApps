/** One payment's contribution to one charge. */
export interface RentPaymentApplication {
  transaction_id: string;
  paid_on: string;
  /** How much of the payment landed on this charge. */
  amount: string;
  payer_name: string | null;
  /** The payment's full value, which may exceed `amount` when one payment
   *  spans two periods. */
  payment_total: string;
}
