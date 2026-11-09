import { TAX_COMPLETENESS_LABELS } from "../constants/taxCompleteness";
import type { CompletenessTone } from "../types/tax/CompletenessTone";
import type { FormCompleteness } from "../types/tax/FormCompleteness";

export function completenessPercent(form: Pick<FormCompleteness, "total_filled" | "total_expected">): number {
  return form.total_expected > 0 ? Math.round((form.total_filled / form.total_expected) * 100) : 0;
}

export function completenessLabel(percent: number): string {
  if (percent === 100) return TAX_COMPLETENESS_LABELS.complete;
  if (percent >= 75) return TAX_COMPLETENESS_LABELS.almostThere;
  if (percent >= 50) return TAX_COMPLETENESS_LABELS.inProgress;
  return TAX_COMPLETENESS_LABELS.needsAttention;
}

export function completenessTone(percent: number): CompletenessTone {
  if (percent === 100) return "complete";
  return percent >= 50 ? "partial" : "low";
}
