import {
  INQUIRY_STAGE_BADGE_COLORS,
  INQUIRY_STAGE_LABELS,
} from "@/shared/lib/inquiry-labels";
import type { InquiryStage } from "@/shared/types/inquiry/inquiry-stage";
import type { BadgeColor } from "@/shared/components/ui/Badge";

const COLOR_CLASSES: Record<BadgeColor, string> = {
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  green: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
};

interface Props {
  stage: InquiryStage;
  className?: string;
}

/**
 * Stage badge for inquiries. Color mapping per RENTALS_PLAN.md §9.1.
 *
 * Hidden in stage-filtered list views (the chip already conveys that
 * information) but shown on detail pages and the unfiltered "All" inbox.
 */
export default function InquiryStageBadge({ stage, className = "" }: Props) {
  const color = INQUIRY_STAGE_BADGE_COLORS[stage];
  return (
    <span
      data-testid={`inquiry-stage-badge-${stage}`}
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${COLOR_CLASSES[color]} ${className}`.trim()}
    >
      {INQUIRY_STAGE_LABELS[stage]}
    </span>
  );
}
