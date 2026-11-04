import { formatShortDate } from "@mybookkeeper/api-client/utils/inquiryDateFormat";
import { tenancyState } from "@mybookkeeper/api-client/utils/tenancyState";
import type { ApplicantSummary } from "@mybookkeeper/api-client/types/applicant/applicant-summary";
import type { TenancyState } from "@mybookkeeper/api-client/types/applicant/tenancy-state";
import { TENANT_MESSAGES } from "../../constants/tenants";

type TenancyFields = Pick<ApplicantSummary, "contract_start" | "contract_end" | "tenant_ended_at">;

const STATE_LABELS: Record<TenancyState, string> = {
  active: TENANT_MESSAGES.active,
  ended: TENANT_MESSAGES.ended,
  expired: TENANT_MESSAGES.expired,
};

export function tenancyStateLabel(state: TenancyState): string {
  return STATE_LABELS[state];
}

/** What's happening with this tenancy, or null when there's nothing to say about the dates. */
export function tenancyLine(tenant: TenancyFields): string | null {
  const state = tenancyState(tenant);
  if (state === "expired" && tenant.contract_end) return `Lease ended ${formatShortDate(tenant.contract_end)}`;
  if (state === "ended" && tenant.tenant_ended_at) return `Ended ${formatShortDate(tenant.tenant_ended_at)}`;
  if (tenant.contract_end) return `Through ${formatShortDate(tenant.contract_end)}`;
  return tenant.contract_start ? `From ${formatShortDate(tenant.contract_start)}` : null;
}

export function tenantRowLabel(tenant: ApplicantSummary, name: string): string {
  const parts = [name, tenancyStateLabel(tenancyState(tenant)), tenancyLine(tenant), tenant.employer_or_hospital?.trim()];
  return parts.filter(Boolean).join(", ");
}
