export interface WorkHistoryUpdateRequest {
  company_name?: string | null;
  title?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean | null;
  bullets?: string[] | null;
}
