import { VERDICT_LABELS } from "../constants/jobAnalysisVerdictLabels";
import { isJobAnalysisVerdict } from "./isJobAnalysisVerdict";

/** Badge label for a card's verdict: the known label, else the raw value, else none. */
export function formatVerdict(verdict: string | null): string | null {
  if (!verdict) return null;
  return isJobAnalysisVerdict(verdict) ? VERDICT_LABELS[verdict] : verdict;
}
