import { useNavigate } from "react-router-dom";
import { formatDesiredDates, formatRelativeTime } from "@/shared/lib/inquiry-date-format";
import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";
import TenantStatusBadge from "./TenantStatusBadge";

export interface TenantRowProps {
  tenant: ApplicantSummary;
}

/**
 * Desktop table row for the Tenants list. Click anywhere navigates to the
 * tenant detail page (same component as ApplicantDetail; the URL is
 * `/tenants/:id` so the breadcrumb context stays "tenant" rather than
 * jumping the user back to /applicants).
 */
export default function TenantRow({ tenant }: TenantRowProps) {
  const navigate = useNavigate();
  const legalName = tenant.legal_name ?? "Unnamed tenant";
  const contractDates = formatDesiredDates(tenant.contract_start, tenant.contract_end);
  const created = formatRelativeTime(tenant.created_at);

  return (
    <tr
      data-testid={`tenant-row-${tenant.id}`}
      onClick={() => navigate(`/tenants/${tenant.id}`)}
      className="border-t cursor-pointer hover:bg-muted/30 transition-colors"
    >
      <td className="px-4 py-3 font-medium">{legalName}</td>
      <td className="px-4 py-3 text-muted-foreground">{contractDates}</td>
      <td className="px-4 py-3 text-muted-foreground">{created}</td>
      <td className="px-4 py-3">
        <TenantStatusBadge tenant={tenant} />
      </td>
    </tr>
  );
}
