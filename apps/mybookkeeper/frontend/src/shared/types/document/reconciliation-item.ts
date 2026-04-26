export interface ReconciliationItem {
  res_code: string;
  billing_period: string | null;
  status: "matched" | "mismatch" | "missing";
  expected_earnings: string | null;
  actual_earnings: string | null;
  document_id: string | null;
}
