import { CheckCircle2, Circle } from "lucide-react";
import {
  computeInquiryQualityScore,
  getQualityTier,
  type InquiryQualitySignals,
} from "@/shared/lib/inquiry-quality";

export interface InquiryQualityBadgeProps {
  signals: InquiryQualitySignals;
  className?: string;
}

/**
 * Renders the inquiry quality badge per RENTALS_PLAN.md §9.2.
 *
 * Visible only at the extremes of the score:
 *   - 0–1 → gray "sparse" badge with empty circle (host should expect to chase
 *           details before triaging)
 *   - 2–3 → renders nothing (standard inquiry — no marker needed)
 *   - 4   → green "complete" badge with check icon
 *
 * Returning ``null`` for the standard tier is intentional — a noisy "OK"
 * badge competing for attention with the actually-important sparse / complete
 * signals defeats the purpose of the heuristic.
 */
export default function InquiryQualityBadge({ signals, className = "" }: InquiryQualityBadgeProps) {
  const score = computeInquiryQualityScore(signals);
  const tier = getQualityTier(score);

  if (tier === "standard") return null;

  if (tier === "sparse") {
    return (
      <span
        data-testid="inquiry-quality-badge-sparse"
        aria-label={`Sparse inquiry (quality ${score} of 4)`}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 ${className}`.trim()}
      >
        <Circle className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>Sparse</span>
      </span>
    );
  }

  return (
    <span
      data-testid="inquiry-quality-badge-complete"
      aria-label={`Complete inquiry (quality ${score} of 4)`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 ${className}`.trim()}
    >
      <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>Complete</span>
    </span>
  );
}
