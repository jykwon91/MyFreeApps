/**
 * TypeScript model for a CompanyResearch record as returned by the MJH backend.
 * Mirrors `CompanyResearchResponse` in
 * apps/myjobhunter/backend/app/schemas/company/company_research_response.py.
 */
import type { ResearchSource } from "@/types/research-source";

export type ResearchSentiment = "positive" | "mixed" | "negative" | "unknown";

export interface CompanyResearch {
  id: string;
  company_id: string;
  user_id: string;

  overall_sentiment: ResearchSentiment;
  senior_engineer_sentiment: string | null;
  interview_process: string | null;
  red_flags: string[];
  green_flags: string[];

  reported_comp_range_min: number | null;
  reported_comp_range_max: number | null;
  comp_currency: string;
  comp_confidence: string;

  raw_synthesis: Record<string, unknown> | null;

  last_researched_at: string | null;
  created_at: string;
  updated_at: string;

  sources: ResearchSource[];
}
