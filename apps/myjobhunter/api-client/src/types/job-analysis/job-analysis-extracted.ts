/** Structured JD facts the analysis pass extracted alongside its verdict. */
export interface JobAnalysisExtracted {
  title: string | null;
  company: string | null;
  location: string | null;
  remote_type: string | null;
  posted_salary_min: number | null;
  posted_salary_max: number | null;
  posted_salary_currency: string | null;
  posted_salary_period: string | null;
  summary: string | null;
}
