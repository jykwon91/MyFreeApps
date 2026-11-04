import { format } from "date-fns";
import type { ApplicantSummary } from "../types/applicant/applicant-summary";
import type { TenancyState } from "../types/applicant/tenancy-state";

type TenancyFields = Pick<ApplicantSummary, "tenant_ended_at" | "contract_end">;

/** The host's date. UTC would call a lease over a day early on a US evening. */
export function localToday(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/**
 * Expired wins over ended: restarting clears only the manual end, so a tenancy
 * whose lease has run out would still be over.
 */
export function tenancyState(tenant: TenancyFields, today: string = localToday()): TenancyState {
  if (tenant.contract_end && tenant.contract_end < today) return "expired";
  return tenant.tenant_ended_at ? "ended" : "active";
}
