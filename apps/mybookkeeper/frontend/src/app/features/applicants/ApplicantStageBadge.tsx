import {
  APPLICANT_STAGE_BADGE_COLORS,
  APPLICANT_STAGE_LABELS,
} from "@/shared/lib/applicant-labels";
import type { ApplicantStage } from "@/shared/types/applicant/applicant-stage";
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
  stage: ApplicantStage;
  className?: string;
}

/**
 * Stage badge for applicants. Color mapping per RENTALS_PLAN.md §9.1.
 *
 * Hidden in stage-filtered list views (the chip already conveys the stage)
 * but shown on detail pages and the unfiltered "All" list.
 */
export default function ApplicantStageBadge({ stage, className = "" }: Props) {
  const color = APPLICANT_STAGE_BADGE_COLORS[stage];
  return (
    <span
      data-testid={`applicant-stage-badge-${stage}`}
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${COLOR_CLASSES[color]} ${className}`.trim()}
    >
      {APPLICANT_STAGE_LABELS[stage]}
    </span>
  );
}
