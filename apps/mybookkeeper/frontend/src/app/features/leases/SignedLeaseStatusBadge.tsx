import {
  SIGNED_LEASE_STATUS_BADGE_COLORS,
  SIGNED_LEASE_STATUS_LABELS,
} from "@/shared/lib/lease-labels";
import type { SignedLeaseStatus } from "@/shared/types/lease/signed-lease-status";
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
  status: SignedLeaseStatus;
  className?: string;
}

/**
 * Status badge for a signed lease. Mirrors the ApplicantStageBadge pattern.
 */
export default function SignedLeaseStatusBadge({ status, className = "" }: Props) {
  const color = SIGNED_LEASE_STATUS_BADGE_COLORS[status];
  return (
    <span
      data-testid={`signed-lease-status-badge-${status}`}
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${COLOR_CLASSES[color]} ${className}`.trim()}
    >
      {SIGNED_LEASE_STATUS_LABELS[status]}
    </span>
  );
}
