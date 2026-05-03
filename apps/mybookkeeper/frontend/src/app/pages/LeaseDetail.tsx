import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import Badge from "@/shared/components/ui/Badge";
import Skeleton from "@/shared/components/ui/Skeleton";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useGenerateSignedLeaseMutation,
  useGetSignedLeaseByIdQuery,
  useUpdateSignedLeaseMutation,
} from "@/shared/store/signedLeasesApi";
import SignedLeaseStatusBadge from "@/app/features/leases/SignedLeaseStatusBadge";
import LeaseAttachmentsSection from "@/app/features/leases/LeaseAttachmentsSection";

type Tab = "files" | "details" | "notes";

export default function LeaseDetail() {
  const { leaseId } = useParams<{ leaseId: string }>();
  const canWrite = useCanWrite();
  const [tab, setTab] = useState<Tab>("files");
  const {
    data: lease,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetSignedLeaseByIdQuery(leaseId ?? "", { skip: !leaseId });
  const [generateLease, { isLoading: isGenerating }] =
    useGenerateSignedLeaseMutation();
  const [updateLease] = useUpdateSignedLeaseMutation();

  async function handleGenerate() {
    if (!lease) return;
    try {
      await generateLease(lease.id).unwrap();
      showSuccess("Lease generated.");
    } catch {
      showError("Couldn't generate the lease. Want to try again?");
    }
  }

  async function handleNotesBlur(next: string) {
    if (!lease) return;
    if (next === (lease.notes ?? "")) return;
    try {
      await updateLease({ leaseId: lease.id, data: { notes: next } }).unwrap();
    } catch {
      showError("Couldn't save notes.");
    }
  }

  async function handleStatusChange(next: string) {
    if (!lease) return;
    try {
      await updateLease({
        leaseId: lease.id,
        data: { status: next as typeof lease.status },
      }).unwrap();
      showSuccess("Status updated.");
    } catch {
      showError("Couldn't update status.");
    }
  }

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <Link
        to="/leases"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to leases
      </Link>

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>I couldn't find that lease.</span>
          <LoadingButton
            variant="secondary"
            size="sm"
            isLoading={isFetching}
            loadingText="Retrying..."
            onClick={() => refetch()}
          >
            Retry
          </LoadingButton>
        </AlertBox>
      ) : null}

      {isLoading || !lease ? (
        !isError ? (
          <div className="space-y-3">
            <Skeleton className="h-7 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-32" />
          </div>
        ) : null
      ) : (
        <>
          <SectionHeader
            title={`Lease ${lease.id.slice(0, 8)}`}
            subtitle={
              <span className="inline-flex items-center gap-2 flex-wrap">
                <SignedLeaseStatusBadge status={lease.status} />
                <span data-testid="lease-kind-badge">
                  <Badge
                    label={lease.kind === "imported" ? "Imported" : "Generated"}
                    color={lease.kind === "imported" ? "purple" : "blue"}
                  />
                </span>
                <span className="text-xs text-muted-foreground">
                  {lease.starts_on ?? "—"} → {lease.ends_on ?? "—"}
                </span>
              </span>
            }
            actions={
              canWrite && lease.status === "draft" && lease.kind === "generated" ? (
                <LoadingButton
                  isLoading={isGenerating}
                  loadingText="Generating..."
                  onClick={handleGenerate}
                  data-testid="lease-generate-button"
                >
                  <FileText size={16} className="mr-1" />
                  Generate
                </LoadingButton>
              ) : null
            }
          />

          {/* Tabs */}
          <div role="tablist" className="flex gap-1 border-b" data-testid="lease-tabs">
            {(["files", "details", "notes"] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                  tab === t
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`lease-tab-${t}`}
              >
                {t === "files"
                  ? `Files (${lease.attachments.length})`
                  : t === "details"
                    ? "Details"
                    : "Notes"}
              </button>
            ))}
          </div>

          {tab === "files" ? (
            <LeaseAttachmentsSection
              leaseId={lease.id}
              attachments={
                lease.kind === "imported"
                  ? lease.attachments.filter((a) => a.kind !== "rendered_original")
                  : lease.attachments
              }
              canWrite={canWrite}
            />
          ) : null}

          {tab === "details" ? (
            <section className="space-y-3" data-testid="lease-details-section">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {Object.entries(lease.values).map(([key, value]) => (
                  <div key={key} className="border-b pb-2">
                    <p className="text-xs uppercase text-muted-foreground font-mono">
                      [{key}]
                    </p>
                    <p className="mt-1">{String(value ?? "—")}</p>
                  </div>
                ))}
              </div>
              {canWrite ? (
                <div className="pt-3 border-t">
                  <label htmlFor="lease-status" className="block text-sm font-medium mb-1">
                    Status
                  </label>
                  <select
                    id="lease-status"
                    value={lease.status}
                    onChange={(e) => void handleStatusChange(e.target.value)}
                    className="px-3 py-2 text-sm border rounded-md"
                    data-testid="lease-status-select"
                  >
                    <option value="draft">Draft</option>
                    <option value="generated">Generated</option>
                    <option value="sent">Sent</option>
                    <option value="signed">Signed</option>
                    <option value="active">Active</option>
                    <option value="ended">Ended</option>
                    <option value="terminated">Terminated</option>
                  </select>
                </div>
              ) : null}
            </section>
          ) : null}

          {tab === "notes" ? (
            <section className="space-y-2" data-testid="lease-notes-section">
              <label htmlFor="lease-notes" className="block text-sm font-medium">
                Internal notes
              </label>
              <textarea
                id="lease-notes"
                defaultValue={lease.notes ?? ""}
                onBlur={(e) => void handleNotesBlur(e.target.value)}
                disabled={!canWrite}
                placeholder="Anything to remember about this lease — points to follow up, signing logistics, etc."
                rows={6}
                className="w-full px-3 py-2 text-sm border rounded-md"
              />
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
