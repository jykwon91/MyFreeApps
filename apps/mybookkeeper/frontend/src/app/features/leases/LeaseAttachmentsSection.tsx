import { useState } from "react";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useDeleteSignedLeaseAttachmentMutation,
  useUpdateLeaseAttachmentMutation,
} from "@mybookkeeper/api-client/store/signedLeasesApi";
import type { LeaseAttachmentKind } from "@mybookkeeper/api-client/types/lease/lease-attachment-kind";
import type { SignedLeaseAttachment } from "@mybookkeeper/api-client/types/lease/signed-lease-attachment";
import AttachmentViewer from "@/app/features/leases/AttachmentViewer";
import LeaseAttachmentDropzone from "@/app/features/leases/LeaseAttachmentDropzone";
import LeaseAttachmentRow from "@/app/features/leases/LeaseAttachmentRow";
import { ConfirmDialog } from "@platform/ui";
import { attachmentBacksExtension } from "./attachmentBacksExtension";

export interface LeaseAttachmentsSectionProps {
  leaseId: string;
  attachments: SignedLeaseAttachment[];
  canWrite: boolean;
}

export default function LeaseAttachmentsSection({ leaseId, attachments, canWrite }: LeaseAttachmentsSectionProps) {
  const [deleteAttachment, { isLoading: isDeleting }] =
    useDeleteSignedLeaseAttachmentMutation();
  const [updateAttachment] = useUpdateLeaseAttachmentMutation();

  const [viewingAttachment, setViewingAttachment] = useState<SignedLeaseAttachment | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SignedLeaseAttachment | null>(null);

  function handleDelete(att: SignedLeaseAttachment) {
    setPendingDelete(att);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const att = pendingDelete;
    try {
      await deleteAttachment({ leaseId, attachmentId: att.id }).unwrap();
      showSuccess("Attachment removed.");
      setPendingDelete(null);
    } catch (err) {
      if (attachmentBacksExtension(err)) {
        setPendingDelete(null);
        showError("This addendum is the record of an extension. Undo the extension to remove it.");
      } else {
        showError("Couldn't remove that file.");
      }
    }
  }

  async function handleKindChange(att: SignedLeaseAttachment, kind: LeaseAttachmentKind) {
    try {
      await updateAttachment({ leaseId, attachmentId: att.id, kind }).unwrap();
      showSuccess("Kind updated.");
    } catch (err) {
      showError(
        attachmentBacksExtension(err)
          ? "This addendum is the record of an extension. Undo the extension to change it."
          : "Couldn't update the kind.",
      );
    }
  }

  return (
    <section className="space-y-3">
      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="lease-attachments-empty">
          No attachments yet.
        </p>
      ) : (
        <ul className="space-y-1">
          {attachments.map((att) => (
            <LeaseAttachmentRow
              key={att.id}
              att={att}
              canWrite={canWrite}
              onPreview={() => setViewingAttachment(att)}
              onDelete={() => void handleDelete(att)}
              onKindChange={(kind) => void handleKindChange(att, kind)}
            />
          ))}
        </ul>
      )}

      {canWrite ? (
        <div className="space-y-2 pt-2 border-t">
          <LeaseAttachmentDropzone leaseId={leaseId} />
        </div>
      ) : null}

      {viewingAttachment ? (
        <AttachmentViewer
          url={viewingAttachment.presigned_url ?? ""}
          filename={viewingAttachment.filename}
          contentType={viewingAttachment.content_type}
          onClose={() => setViewingAttachment(null)}
        />
      ) : null}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Remove attachment?"
        description={
          pendingDelete
            ? `${pendingDelete.filename} will be permanently deleted. The lease record itself will not be affected.`
            : ""
        }
        confirmLabel="Remove"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
