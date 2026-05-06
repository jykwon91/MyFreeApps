import { useEffect } from "react";
import { Download, FileText } from "lucide-react";
import { LEASE_ATTACHMENT_KIND_LABELS } from "@/shared/lib/lease-labels";
import type { LeaseAttachmentKind } from "@/shared/types/lease/lease-attachment-kind";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";
import { reportMissingStorageObject } from "@/shared/lib/storage-observability";

export interface LinkedLeaseDocumentsListProps {
  attachments: readonly SignedLeaseAttachment[];
  onPreview: (attachment: SignedLeaseAttachment) => void;
}

/**
 * Click on filename = view document. The user's intent is always to
 * VIEW — not to upload. Missing-storage rows are captured to PostHog +
 * Sentry on render so the operator can take action; the click itself
 * still attempts a view via the (possibly empty) presigned URL. No
 * UI hijacking, no destructive alerts, no re-upload pickers.
 */
export default function LinkedLeaseDocumentsList({
  attachments,
  onPreview,
}: LinkedLeaseDocumentsListProps) {
  useEffect(() => {
    for (const att of attachments) {
      if (att.is_available === false) {
        reportMissingStorageObject({
          domain: "lease_attachment",
          attachment_id: att.id,
          storage_key: att.storage_key,
          parent_id: att.lease_id,
          parent_kind: "signed_lease",
        });
      }
    }
  }, [attachments]);

  return (
    <ul className="space-y-1">
      {attachments.map((att) => {
        const kindLabel =
          LEASE_ATTACHMENT_KIND_LABELS[att.kind as LeaseAttachmentKind] ?? att.kind;

        return (
          <li
            key={att.id}
            className="border rounded-md px-3 py-2 text-sm flex items-center justify-between gap-2"
            data-testid={`linked-lease-attachment-${att.id}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
              {/* Filename always opens the AttachmentViewer modal — the
                  modal renders the file when the URL is present, or a
                  neutral "no longer available" message when it's not. */}
              <button
                type="button"
                onClick={() => onPreview(att)}
                className="text-left text-primary hover:underline font-medium truncate"
                data-testid={`linked-lease-attachment-preview-${att.id}`}
                title={att.filename}
              >
                {att.filename}
              </button>
              <span className="text-xs text-muted-foreground shrink-0">{kindLabel}</span>
            </div>
            {att.presigned_url ? (
              <a
                href={att.presigned_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground shrink-0"
                aria-label={`Download ${att.filename}`}
                data-testid={`linked-lease-attachment-download-${att.id}`}
              >
                <Download size={14} />
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
