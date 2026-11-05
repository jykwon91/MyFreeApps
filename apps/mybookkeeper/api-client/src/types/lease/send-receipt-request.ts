export interface SendReceiptRequest {
  period_start: string;
  period_end: string;
  payment_method?: string | null;
}
