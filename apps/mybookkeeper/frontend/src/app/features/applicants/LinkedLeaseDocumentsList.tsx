import { useRef } from "react";
import { Download, FileText } from "lucide-react";
import { LEASE_ATTACHMENT_KIND_LABELS } from "@/shared/lib/lease-labels";
import type { LeaseAttachmentKind } from "@/shared/types/lease/lease-attachment-kind";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";
import { LEASE_REUPLOAD_ACCEPT } from "@/shared/lib/lease-reupload-accept";
import { reportMissingStorageObject } from "@/shared/lib/storage-observability";

export interface LinkedLeaseDocumentsListProps {
  attachments: readonly SignedLeaseAttachment[];
  canWrite: boolean;
  onPreview: (attachment: SignedLeaseAttachment) => void;
  onReupload: (attachment: SignedLeaseAttachment, file: File) => void;
}

/**
 * Renders each lease attachment row with the filename ALWAYS clickable.
 * Behavior depends on state — but the user never sees a "File missing"
 * alert; the only signal that something is off is that clicking opens a
 * re-upload picker instead of the document. Operators see the
 * underlying issue via PostHog + Sentry + the Network tab.
 */
export default function LinkedLeaseDocumentsList({
  attachments,
  canWrite,
  onPreview,
  onReupload,
}: LinkedLeaseDocumentsListProps) {
  const reuploadInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const triggerReupload = (attId: string) => {
    reuploadInputs.current[attId]?.click();
  };

  function handleMissingClick(att: SignedLeaseAttachment) {
    reportMissingStorageObject({
      domain: "lease_attachment",
      attachment_id: att.id,
      storage_key: att.storage_key,
      parent_id: att.lease_id,
      parent_kind: "signed_lease",
    });
    if (canWrite) triggerReupload(att.id);
  }

  return (
    <ul className="space-y-1">
      {attachments.map((att) => {
        const isMissing = att.is_available === false;
        const canPreviewInline =
          !isMissing
          && att.presigned_url !== null
          && (att.content_type === "application/pdf"
            || att.content_type.startsWith("image/"));
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
              {isMissing ? (
                <button
                  type="button"
                  onClick={() => handleMissingClick(att)}
                  className="text-left text-primary hover:underline font-medium truncate"
                  data-testid={`linked-lease-attachment-preview-${att.id}`}
                  title={att.filename}
                >
                  {att.filename}
                </button>
              ) : canPreviewInline ? (
                <button
                  type="button"
                  onClick={() => onPreview(att)}
                  className="text-left text-primary hover:underline font-medium truncate"
                  data-testid={`linked-lease-attachment-preview-${att.id}`}
                  title={att.filename}
                >
                  {att.filename}
                </button>
              ) : att.presigned_url ? (
                <a
                  href={att.presigned_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-left text-primary hover:underline font-medium truncate"
                  data-testid={`linked-lease-attachment-download-link-${att.id}`}
                  title={att.filename}
                >
                  {att.filename}
                </a>
              ) : (
                <span className="truncate text-muted-foreground" title={att.filename}>
                  {att.filename}
                </span>
              )}
              <span className="text-xs text-muted-foreground shrink-0">{kindLabel}</span>
            </div>
            {!isMissing && att.presigned_url ? (
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
            <input
              ref={(el) => {
                reuploadInputs.current[att.id] = el;
              }}
              type="file"
              className="hidden"
              accept={LEASE_REUPLOAD_ACCEPT}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onReupload(att, file);
                e.target.value = "";
              }}
            />
          </li>
        );
      })}
    </ul>
  );
}
