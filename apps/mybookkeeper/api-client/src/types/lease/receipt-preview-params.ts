export interface ReceiptPreviewParams {
  periodStart: string;
  periodEnd: string;
  /** Empty leaves the method off the receipt. */
  paymentMethod?: string | null;
}
