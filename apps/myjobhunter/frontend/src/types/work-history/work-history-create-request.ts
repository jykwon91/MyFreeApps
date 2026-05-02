export interface WorkHistoryCreateRequest {
  company_name: string;
  title: string;
  start_date: string;
  end_date: string | null;
  bullets: string[];
}
