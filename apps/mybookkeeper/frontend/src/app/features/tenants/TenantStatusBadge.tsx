import { StatusBadge } from "@platform/ui";
import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";

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
  const todayStr = today ?? new Date().toISOString().slice(0, 10);
  const ended =
    tenant.tenant_ended_at !== null ||
    (tenant.contract_end !== null &&
      tenant.contract_end !== undefined &&
      tenant.contract_end < todayStr);

  if (ended) {
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
