/** What `inferPaymentMethod` reads from a payment: a pending receipt or a transaction. */
export interface PaymentFacts {
  payment_method: string | null;
  vendor: string | null;
}
