import type { InquirySpamStatus } from "@mybookkeeper/api-client/types/inquiry/inquiry-spam-status";
import { inquirySpamLabel } from "@mybookkeeper/api-client/utils/inquirySpamLabel";

/**
 * Color-coded triage badge for an inquiry. Surfaces the score + status with
 * the green/yellow/red bands the operator's spam threshold defines.
 */
interface InquirySpamBadgeProps {
  status: InquirySpamStatus;
  score: number | null;
}

const CLASS_NAMES: Record<InquirySpamStatus, string> = {
  manually_cleared: "bg-green-100 text-green-700 border-green-200",
  spam: "bg-red-100 text-red-700 border-red-200",
  flagged: "bg-yellow-100 text-yellow-700 border-yellow-200",
  clean: "bg-green-100 text-green-700 border-green-200",
  // unscored — gmail / manual / degraded Claude
  unscored: "bg-muted text-muted-foreground border-muted",
};

export default function InquirySpamBadge({ status, score }: InquirySpamBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full border ${CLASS_NAMES[status]}`}
      data-testid={`inquiry-spam-badge-${status}`}
    >
      {inquirySpamLabel(status, score)}
    </span>
  );
}
