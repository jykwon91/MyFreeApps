export interface ReceiptSendValues {
  periodStart: string;
  periodEnd: string;
  /** Empty leaves the method off the receipt. */
  paymentMethod: string;
}
