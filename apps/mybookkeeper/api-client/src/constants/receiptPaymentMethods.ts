/** Payment methods a receipt can print, keyed by the value the send endpoint takes. */
export const RECEIPT_PAYMENT_METHOD_LABELS: Readonly<Record<string, string>> = {
  check: "Check",
  credit_card: "Credit card",
  bank_transfer: "Bank transfer",
  zelle: "Zelle",
  venmo: "Venmo",
  cash_app: "Cash App",
  paypal: "PayPal",
  cash: "Cash",
  platform_payout: "Platform payout",
  other: "Other",
};
