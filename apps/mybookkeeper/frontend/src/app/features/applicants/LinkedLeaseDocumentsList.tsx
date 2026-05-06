import { Download, FileText } from "lucide-react";
import { LEASE_ATTACHMENT_KIND_LABELS } from "@/shared/lib/lease-labels";
import type { LeaseAttachmentKind } from "@/shared/types/lease/lease-attachment-kind";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";
import MissingFileAffordance from "@/shared/components/storage/MissingFileAffordance";
import { LEASE_REUPLOAD_ACCEPT } from "@/shared/lib/lease-reupload-accept";

export interface LinkedLeaseDocumentsListProps {
  attachments: readonly SignedLeaseAttachment[];
  canWrite: boolean;
  onPreview: (attachment: SignedLeaseAttachment) => void;
  onReupload: (attachment: SignedLeaseAttachment, file: File) => void;
}

export default function LinkedLeaseDocumentsList({
  attachments,
  canWrite,
  onPreview,
  onReupload,
}: LinkedLeaseDocumentsListProps) {
  return (
    <ul className="space-y-1">
      {attachments.map((att) => {
        const isMissing = att.is_available === false;
        const canPreview =
          !isMissing
          && att.presigned_url !== null
          && (att.content_type === "application/pdf"
            || att.content_type.startsWith("image/"));
        const kindLabel =
          LEASE_ATTACHMENT_KIND_LABELS[att.kind as LeaseAttachmentKind] ?? att.kind;
        return (
          <li
            key={att.id}
            className="border rounded-md px-3 py-2 text-sm space-y-1"
            data-testid={`linked-lease-attachment-${att.id}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                {canPreview ? (
                  <button
                    type="button"
                    onClick={() => onPreview(att)}
                    className="text-left text-primary hover:underline font-medium truncate"
                    data-testid={`linked-lease-attachment-preview-${att.id}`}
                    title={att.filename}
                  >
                    {att.filename}
                  </button>
                ) : (
                  <span
                    className={`truncate ${
                      isMissing ? "text-destructive" : "text-muted-foreground"
                    }`}
                    title={att.filename}
                  >
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
            </div>
            {isMissing ? (
              <MissingFileAffordance
                canReupload={canWrite}
                onReupload={(file) => onReupload(att, file)}
                acceptMime={LEASE_REUPLOAD_ACCEPT}
                testIdPrefix={`linked-lease-attachment-${att.id}`}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
