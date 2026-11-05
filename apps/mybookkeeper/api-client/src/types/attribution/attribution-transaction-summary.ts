export interface AttributionTransactionSummary {
  id: string;
  transaction_date: string;
  amount: string;
  vendor: string | null;
  payer_name: string | null;
  description: string | null;
  property_id: string | null;
  channel: string | null;
}
