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
      <span
        data-testid="tenant-status-badge-ended"
        className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
      >
        Ended
      </span>
    );
  }

  return (
    <span
      data-testid="tenant-status-badge-active"
      className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
    >
      Active
    </span>
  );
}
