import { useState } from "react";
import {
  useDeleteSignedLeaseAttachmentMutation,
  useGetSignedLeaseByIdQuery,
  useUploadSignedLeaseAttachmentMutation,
} from "@/shared/store/signedLeasesApi";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";
import type { SignedLeaseSummary } from "@/shared/types/lease/signed-lease-summary";
import SignedLeaseStatusBadge from "@/app/features/leases/SignedLeaseStatusBadge";
import AttachmentViewer from "@/app/features/leases/AttachmentViewer";
import { formatLongDate } from "@/shared/lib/inquiry-date-format";
import LinkedLeaseDocumentsBody from "./LinkedLeaseDocumentsBody";
import { useLinkedLeaseDocumentsMode } from "./useLinkedLeaseDocumentsMode";

export interface LinkedLeaseDocumentsProps {
  lease: SignedLeaseSummary;
  canWrite: boolean;
}

const RECEIPT_KIND = "rent_receipt";

/**
 * Lists a single linked lease's NON-RECEIPT attachments inline on the
 * applicant/tenant detail page. Receipts render in a separate section
 * via ``LinkedLeaseReceipts`` so the Leases group only shows the lease
 * agreement + addenda + amendments. Click a filename to open the
 * document via ``AttachmentViewer``.
 *
 * When an attachment row's underlying storage object is missing
 * (``is_available=false``), this view surfaces a "File missing" alert
 * with a "Re-upload" button (write access only). Re-upload deletes the
 * orphan row and uploads the picked file under the same ``kind``.
 */
export default function LinkedLeaseDocuments({ lease, canWrite }: LinkedLeaseDocumentsProps) {
  const { data: detail, isLoading } = useGetSignedLeaseByIdQuery(lease.id);
  const [viewing, setViewing] = useState<SignedLeaseAttachment | null>(null);
  const [uploadAttachment] = useUploadSignedLeaseAttachmentMutation();
  const [deleteAttachment] = useDeleteSignedLeaseAttachmentMutation();

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

  async function handleReupload(att: SignedLeaseAttachment, file: File) {
    try {
      await deleteAttachment({ leaseId: lease.id, attachmentId: att.id }).unwrap();
    } catch {
      showError("Couldn't remove the broken file. Please try again.");
      return;
    }
    try {
      await uploadAttachment({ leaseId: lease.id, file, kind: att.kind }).unwrap();
      showSuccess(`${file.name} uploaded.`);
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if (status === 413) showError(`${file.name} is too large.`);
      else if (status === 415) showError(`${file.name}: unsupported file type.`);
      else showError(`Couldn't upload ${file.name}.`);
    }
  }

  return (
    <div className="space-y-2" data-testid={`linked-lease-${lease.id}`}>
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="font-medium">
          {lease.kind === "imported" ? "Imported lease" : "Generated lease"}
        </span>
        <SignedLeaseStatusBadge status={lease.status} />
        {dates ? (
          <span className="text-xs text-muted-foreground">{dates}</span>
        ) : null}
      </div>

      <LinkedLeaseDocumentsBody
        mode={mode}
        attachments={attachments}
        canWrite={canWrite}
        onPreview={setViewing}
        onReupload={handleReupload}
      />

      {viewing?.presigned_url ? (
        <AttachmentViewer
          url={viewing.presigned_url}
          filename={viewing.filename}
          contentType={viewing.content_type}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}
