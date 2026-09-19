import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";

type TenantEndFields = Pick<ApplicantSummary, "tenant_ended_at" | "contract_end">;

export interface TenantOption {
  id: string;
  label: string;
}

/**
 * Mirrors the backend ``applicant_repo.is_ended`` predicate: a tenancy has
 * ended when the host ended it manually, or the latest lease has expired.
 */
export function isTenantEnded(tenant: TenantEndFields, today?: string): boolean {
  const todayStr = today ?? new Date().toISOString().slice(0, 10);
  if (tenant.tenant_ended_at) return true;
  return Boolean(tenant.contract_end && tenant.contract_end < todayStr);
}

/**
 * Options for a "link this payment to a tenant" picker. Ended tenants stay in
 * the list — their past payments are still attributed to them, and a final or
 * late payment can arrive after move-out — but sort after active tenants and
 * carry an "(ended)" suffix so the host picks deliberately.
 */
export function buildTenantOptions(tenants: ApplicantSummary[], today?: string): TenantOption[] {
  const withStatus = tenants.map((tenant) => ({ tenant, ended: isTenantEnded(tenant, today) }));
  const active = withStatus.filter((t) => !t.ended);
  const ended = withStatus.filter((t) => t.ended);
  return [...active, ...ended].map(({ tenant, ended: isEnded }) => {
    const name = tenant.legal_name ?? "Unnamed";
    if (isEnded) return { id: tenant.id, label: `${name} (ended)` };
    return { id: tenant.id, label: name };
  });
}
