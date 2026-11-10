import type { BadgeColor } from "@platform/ui/components/ui/Badge";
import { VERDICT_LABELS } from "@myjobhunter/api-client/constants/jobAnalysisVerdictLabels";
import { isJobAnalysisVerdict } from "@myjobhunter/api-client/utils/isJobAnalysisVerdict";
import { KANBAN_VERDICT_COLORS } from "@/constants/kanbanVerdictColors";

/** Badge label for a card's verdict: the known label, else the raw value, else none. */
export function labelForVerdict(verdict: string | null): string | null {
  if (!verdict) return null;
  return isJobAnalysisVerdict(verdict) ? VERDICT_LABELS[verdict] : verdict;
}

/** Badge colour for a card's verdict; blue when there is none or it's unknown. */
export function colorForVerdict(verdict: string | null): BadgeColor {
  return verdict && isJobAnalysisVerdict(verdict) ? KANBAN_VERDICT_COLORS[verdict] : "blue";
}
