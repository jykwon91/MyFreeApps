import { Link } from "react-router-dom";
import { ExternalLink, FileText } from "lucide-react";
import SignedLeaseStatusBadge from "@/app/features/leases/SignedLeaseStatusBadge";
import type { SignedLeaseSummary } from "@/shared/types/lease/signed-lease-summary";
import { formatLongDate } from "@/shared/lib/inquiry-date-format";

interface Props {
  lease: SignedLeaseSummary;
}

export default function LinkedLeaseCard({ lease }: Props) {
  const dates =
    lease.starts_on || lease.ends_on
      ? `${lease.starts_on ? formatLongDate(lease.starts_on) : "—"} → ${
          lease.ends_on ? formatLongDate(lease.ends_on) : "—"
        }`
      : null;

  return (
    <Link
      to={`/leases/${lease.id}`}
      data-testid={`linked-lease-${lease.id}`}
      className="block border rounded-md px-3 py-2 hover:bg-muted/40 transition-colors min-h-[44px]"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium truncate">
            {lease.kind === "imported" ? "Imported lease" : "Generated lease"}
          </span>
          <SignedLeaseStatusBadge status={lease.status} />
        </div>
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
      </div>
      {dates ? (
        <p className="text-xs text-muted-foreground mt-1">{dates}</p>
      ) : null}
    </Link>
  );
}
