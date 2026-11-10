import type { JobAnalysisDimension } from "./job-analysis-dimension";
import type { JobAnalysisExtracted } from "./job-analysis-extracted";
import type { JobAnalysisVerdict } from "./job-analysis-verdict";

/** Response body for POST /jobs/analyze and GET /jobs/analyze/{id}. */
export interface JobAnalysis {
  id: string;
  user_id: string;
  source_url: string | null;
  jd_text: string;
  fingerprint: string;

  extracted: JobAnalysisExtracted;
  verdict: JobAnalysisVerdict;
  verdict_summary: string;
  dimensions: JobAnalysisDimension[];
  red_flags: string[];
  green_flags: string[];

  total_tokens_in: number;
  total_tokens_out: number;
  /** Decimal serialized as JSON number; treat as a number for display. */
  total_cost_usd: number;

  applied_application_id: string | null;
  created_at: string;
  updated_at: string;
}
