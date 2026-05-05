import { Link } from "react-router-dom";
import { formatDesiredDates, formatRelativeTime } from "@/shared/lib/inquiry-date-format";
import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";
import TenantStatusBadge from "./TenantStatusBadge";

export interface TenantCardProps {
  tenant: ApplicantSummary;
}

/**
 * Mobile card for the Tenants list. Whole card is tappable (touch target ≥ 44px).
 */
export default function TenantCard({ tenant }: TenantCardProps) {
  const legalName = tenant.legal_name ?? "Unnamed tenant";
  const contractDates = formatDesiredDates(tenant.contract_start, tenant.contract_end);
  const created = formatRelativeTime(tenant.created_at);

  return (
    <Link
      to={`/tenants/${tenant.id}`}
      data-testid={`tenant-card-${tenant.id}`}
      className="block border rounded-lg p-4 min-h-[44px] hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="font-medium leading-tight truncate">{legalName}</p>
        <TenantStatusBadge tenant={tenant} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate">{contractDates}</span>
        <span className="shrink-0 ml-2">{created}</span>
      </div>
    </Link>
  );
}
