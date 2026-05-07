import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  useGetSignedLeaseByIdQuery,
  useDeleteSignedLeaseMutation,
} from "@/shared/store/signedLeasesApi";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";
import type { SignedLeaseSummary } from "@/shared/types/lease/signed-lease-summary";
import SignedLeaseStatusBadge from "@/app/features/leases/SignedLeaseStatusBadge";
import AttachmentViewer from "@/app/features/leases/AttachmentViewer";
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";
import { formatLongDate } from "@/shared/lib/inquiry-date-format";
import LinkedLeaseDocumentsBody from "./LinkedLeaseDocumentsBody";
import { useLinkedLeaseDocumentsMode } from "./useLinkedLeaseDocumentsMode";

export interface LinkedLeaseDocumentsProps {
  lease: SignedLeaseSummary;
  canWrite?: boolean;
}

const RECEIPT_KIND = "rent_receipt";

/**
 * Lists a single linked lease's NON-RECEIPT attachments inline on the
 * applicant/tenant detail page. Receipts render in a separate section
 * via ``LinkedLeaseReceipts``. Click a filename to open the document
 * via ``AttachmentViewer``.
 *
 * Missing-storage rows (``is_available=false``) are captured to
 * PostHog + Sentry observability — there's no user-facing UI for the
 * broken state. The host-side recovery path is the existing
 * delete + upload flow on the lease detail page.
 */
export default function LinkedLeaseDocuments({ lease, canWrite = false }: LinkedLeaseDocumentsProps) {
  const { data: detail, isLoading } = useGetSignedLeaseByIdQuery(lease.id);
  const [deleteLease, { isLoading: isDeleting }] = useDeleteSignedLeaseMutation();
  const [viewing, setViewing] = useState<SignedLeaseAttachment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dates =
    lease.starts_on || lease.ends_on
      ? `${lease.starts_on ? formatLongDate(lease.starts_on) : "—"} → ${
          lease.ends_on ? formatLongDate(lease.ends_on) : "—"
        }`
      : null;
  const attachments = (detail?.attachments ?? []).filter(
    (att) => att.kind !== RECEIPT_KIND,
  );

  const mode = useLinkedLeaseDocumentsMode({ isLoading, attachments });

  async function handleConfirmDelete() {
    try {
      await deleteLease(lease.id).unwrap();
      showSuccess("Lease deleted.");
    } catch {
      showError("Couldn't delete that lease. Please try again.");
    } finally {
      setConfirmDelete(false);
    }
  }

  return (
    <div className="space-y-2" data-testid={`linked-lease-${lease.id}`}>
      {confirmDelete ? (
        <ConfirmDialog
          open
          title="Delete this lease?"
          description={`This will permanently remove Lease ${lease.id.slice(0, 8)} and all its attachments. This can't be undone.`}
          confirmLabel="Delete"
          variant="danger"
          isLoading={isDeleting}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="font-medium">
            {lease.kind === "imported" ? "Imported lease" : "Generated lease"}
          </span>
          <SignedLeaseStatusBadge status={lease.status} />
          {dates ? (
            <span className="text-xs text-muted-foreground">{dates}</span>
          ) : null}
        </div>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label={`Delete lease ${lease.id.slice(0, 8)}`}
            data-testid={`linked-lease-delete-btn-${lease.id}`}
            className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded min-h-[44px] min-w-[44px] flex items-center justify-center sm:min-h-[32px] sm:min-w-[32px]"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <LinkedLeaseDocumentsBody
        mode={mode}
        attachments={attachments}
        onPreview={setViewing}
      />

      {viewing ? (
        <AttachmentViewer
          url={viewing.presigned_url ?? ""}
          filename={viewing.filename}
          contentType={viewing.content_type}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}
