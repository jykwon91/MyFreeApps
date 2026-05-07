import { useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import type { LeasesListMode } from "@/shared/types/lease/leases-list-mode";
import type { SignedLeaseSummary } from "@/shared/types/lease/signed-lease-summary";
import EmptyState from "@/shared/components/ui/EmptyState";
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";
import LeasesListSkeleton from "./LeasesListSkeleton";
import SignedLeaseStatusBadge from "./SignedLeaseStatusBadge";

export interface LeasesListBodyProps {
  mode: LeasesListMode;
  leases: SignedLeaseSummary[];
  canWrite?: boolean;
  onDelete?: (lease: SignedLeaseSummary) => Promise<void>;
  isDeleting?: boolean;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default function LeasesListBody({
  mode,
  leases,
  canWrite = false,
  onDelete,
  isDeleting = false,
}: LeasesListBodyProps) {
  const [pendingDelete, setPendingDelete] = useState<SignedLeaseSummary | null>(null);

  function handleDeleteClick(lease: SignedLeaseSummary) {
    setPendingDelete(lease);
  }

  async function handleConfirmDelete() {
    if (!pendingDelete || !onDelete) return;
    await onDelete(pendingDelete);
    setPendingDelete(null);
  }

  switch (mode) {
    case "loading":
      return <LeasesListSkeleton />;
    case "empty":
      return (
        <EmptyState message="No leases yet — generate one from a template or import an already-signed PDF using the button above." />
      );
    case "list":
      return (
        <>
          {pendingDelete ? (
            <ConfirmDialog
              open
              title="Delete this lease?"
              description={`This will permanently remove Lease ${pendingDelete.id.slice(0, 8)} and all its attachments. This can't be undone.`}
              confirmLabel="Delete"
              variant="danger"
              isLoading={isDeleting}
              onConfirm={() => void handleConfirmDelete()}
              onCancel={() => setPendingDelete(null)}
            />
          ) : null}

          {/* Desktop table */}
          <div
            className="hidden md:block border rounded-lg overflow-hidden"
            data-testid="leases-table"
          >
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Lease</th>
                  <th className="px-4 py-2 font-medium">Tenant</th>
                  <th className="px-4 py-2 font-medium">Term</th>
                  <th className="px-4 py-2 font-medium">Generated</th>
                  <th className="px-4 py-2 font-medium">Signed</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  {canWrite ? <th className="px-4 py-2 font-medium sr-only">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {leases.map((lease) => (
                  <tr
                    key={lease.id}
                    className="border-t hover:bg-muted/40"
                    data-testid={`lease-row-${lease.id}`}
                  >
                    <td className="px-4 py-2">
                      <Link
                        to={`/leases/${lease.id}`}
                        className="text-primary hover:underline"
                      >
                        Lease {lease.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      {lease.applicant_legal_name ? (
                        <Link
                          to={`/applicants/${lease.applicant_id}`}
                          className="text-primary hover:underline"
                          data-testid={`lease-tenant-link-${lease.id}`}
                        >
                          {lease.applicant_legal_name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {lease.starts_on ?? "—"} → {lease.ends_on ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {lease.generated_at ? formatDate(lease.generated_at) : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {lease.signed_at ? formatDate(lease.signed_at) : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <SignedLeaseStatusBadge status={lease.status} />
                    </td>
                    {canWrite ? (
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteClick(lease)}
                          aria-label={`Delete lease ${lease.id.slice(0, 8)}`}
                          data-testid={`lease-delete-btn-${lease.id}`}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded min-h-[44px] min-w-[44px] flex items-center justify-center sm:min-h-[32px] sm:min-w-[32px]"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden space-y-3" data-testid="leases-mobile">
            {leases.map((lease) => (
              <li key={lease.id} className="border rounded-lg">
                <div className="flex items-start justify-between gap-2 p-3">
                  <Link
                    to={`/leases/${lease.id}`}
                    className="block flex-1 hover:bg-muted/40 rounded"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">
                        Lease {lease.id.slice(0, 8)}
                      </span>
                      <SignedLeaseStatusBadge status={lease.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {lease.starts_on ?? "—"} → {lease.ends_on ?? "—"}
                    </p>
                  </Link>
                  {canWrite ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(lease)}
                      aria-label={`Delete lease ${lease.id.slice(0, 8)}`}
                      data-testid={`lease-delete-btn-mobile-${lease.id}`}
                      className="text-muted-foreground hover:text-destructive transition-colors p-2 rounded min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      );
  }
}
