import { StatusBadge } from "@platform/ui";
import type { BadgeTone } from "@platform/ui";
import { SIGNED_LEASE_STATUS_LABELS } from "@/shared/lib/lease-labels";
import type { SignedLeaseStatus } from "@/shared/types/lease/signed-lease-status";

const STATUS_TONES: Record<SignedLeaseStatus, BadgeTone> = {
  draft: "neutral",
  generated: "info",
  sent: "info",
  signed: "success",
  active: "success",
  ended: "neutral",
  terminated: "danger",
};

export interface SignedLeaseStatusBadgeProps {
  status: SignedLeaseStatus;
  className?: string;
}

/**
 * Status badge for a signed lease. Mirrors the ApplicantStageBadge pattern.
 */
export default function SignedLeaseStatusBadge({ status, className }: SignedLeaseStatusBadgeProps) {
  return (
    <StatusBadge
      tone={STATUS_TONES[status]}
      label={SIGNED_LEASE_STATUS_LABELS[status]}
      className={className}
      data-testid={`signed-lease-status-badge-${status}`}
    />
  );
}
