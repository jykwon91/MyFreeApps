import { StatusBadge } from "@platform/ui";
import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";
import { isTenantEnded } from "@/shared/lib/tenant-status";

export interface TenantStatusBadgeProps {
  tenant: ApplicantSummary;
  today?: string;
}

/**
 * Shows "Active" or "Ended" badge for a tenant row.
 *
 * A tenant is ended if:
 * - tenant_ended_at is set (manual end), OR
 * - contract_end is not null and is before today (contract expiry)
 */
export default function TenantStatusBadge({ tenant, today }: TenantStatusBadgeProps) {
  if (isTenantEnded(tenant, today)) {
    return (
      <StatusBadge
        tone="neutral"
        label="Ended"
        data-testid="tenant-status-badge-ended"
      />
    );
  }

  return (
    <StatusBadge
      tone="success"
      label="Active"
      data-testid="tenant-status-badge-active"
    />
  );
}
