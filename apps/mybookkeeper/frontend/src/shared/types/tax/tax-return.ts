export type TaxReturnStatus = "draft" | "ready" | "filed";

export interface TaxReturn {
  id: string;
  organization_id: string;
  tax_year: number;
  filing_status: string;
  jurisdiction: string;
  status: TaxReturnStatus;
  needs_recompute: boolean;
  filed_at: string | null;
  created_at: string;
  updated_at: string;
}
