import { VERDICT_LABELS } from "../constants/jobAnalysisVerdictLabels";
import { JOB_ANALYSIS_FALLBACKS } from "../constants/jobAnalysis";
import { isJobAnalysisVerdict } from "./isJobAnalysisVerdict";

/** The analysis result's verdict heading: the known label, else a plain "Analyzed", never the raw value. */
export function verdictBannerLabel(verdict: string): string {
  return isJobAnalysisVerdict(verdict) ? VERDICT_LABELS[verdict] : JOB_ANALYSIS_FALLBACKS.verdict;
}
