import type { JobAnalysisVerdict } from "@/types/job-analysis/job-analysis-verdict";

/** A single discovered posting in the inbox. Mirrors backend DiscoveredJobResponse. */
export interface DiscoveredJob {
  id: string;
  source: string;
  source_publisher: string | null;
  source_url: string | null;
  title: string;
  company_name: string;
  location: string | null;
  remote_type: string;
  description: string | null;
  posted_at: string | null;
  discovered_at: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  score: number | null;
  score_reason: string | null;
  scored_at: string | null;
  dismissed_at: string | null;
  dismissed_reason: string | null;
  saved_at: string | null;
  promoted_application_id: string | null;
  /** Derived by the backend from ``score``. Null for unscored rows. */
  verdict: JobAnalysisVerdict | null;
}
