import type { InquirySpamStatus } from "@/shared/types/inquiry/inquiry-spam-status";

/**
 * Color-coded triage badge for an inquiry. Surfaces the score + status with
 * the green/yellow/red bands the operator's spam threshold defines.
 */
interface InquirySpamBadgeProps {
  status: InquirySpamStatus;
  score: number | null;
}

interface BadgeConfig {
  label: string;
  className: string;
}

function configFor(status: InquirySpamStatus, score: number | null): BadgeConfig {
  if (status === "manually_cleared") {
    return {
      label: "Cleared",
      className: "bg-green-100 text-green-700 border-green-200",
    };
  }
  if (status === "spam") {
    return { label: "Spam", className: "bg-red-100 text-red-700 border-red-200" };
  }
  if (status === "flagged") {
    return {
      label: score !== null ? `Flagged · ${Math.round(score)}` : "Flagged",
      className: "bg-yellow-100 text-yellow-700 border-yellow-200",
    };
  }
  if (status === "clean") {
    return {
      label: score !== null ? `Clean · ${Math.round(score)}` : "Clean",
      className: "bg-green-100 text-green-700 border-green-200",
    };
  }
  // unscored — gmail / manual / degraded Claude
  return {
    label: "Unscored",
    className: "bg-muted text-muted-foreground border-muted",
  };
}

export default function InquirySpamBadge({ status, score }: InquirySpamBadgeProps) {
  const cfg = configFor(status, score);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full border ${cfg.className}`}
      data-testid={`inquiry-spam-badge-${status}`}
    >
      {cfg.label}
    </span>
  );
}
