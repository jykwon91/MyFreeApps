import { JOB_ANALYSIS_FALLBACKS } from "../constants/jobAnalysis";
import type { JobAnalysisExtracted } from "../types/job-analysis/job-analysis-extracted";
import type { JobAnalysisHeadline } from "../types/job-analysis/job-analysis-headline";

/** The role, company and location to head an analysis with, trimmed, with fallbacks for a blank role or company. */
export function jobAnalysisHeadline(extracted: JobAnalysisExtracted): JobAnalysisHeadline {
  return {
    title: extracted.title?.trim() || JOB_ANALYSIS_FALLBACKS.title,
    company: extracted.company?.trim() || JOB_ANALYSIS_FALLBACKS.company,
    location: extracted.location?.trim() || null,
  };
}
