import { useRef } from "react";
import { AlertTriangle, Download, FileText, Upload } from "lucide-react";
import { LEASE_ATTACHMENT_KIND_LABELS } from "@/shared/lib/lease-labels";
import type { LeaseAttachmentKind } from "@/shared/types/lease/lease-attachment-kind";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";
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
  // One hidden <input type="file"> per row. The filename button AND the
  // explicit "Re-upload" button both fire its click event so the user can
  // start a re-upload from either place.
  const reuploadInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const triggerReupload = (attId: string) => {
    reuploadInputs.current[attId]?.click();
  };

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
            className="border rounded-md px-3 py-2 text-sm space-y-1"
            data-testid={`linked-lease-attachment-${att.id}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText
                  className={`h-4 w-4 shrink-0 ${
                    isMissing ? "text-destructive" : "text-muted-foreground"
                  }`}
                  aria-hidden="true"
                />
                {/* Filename is always clickable. Behavior depends on state:
                    - missing  → opens the file picker for re-upload
                    - PDF/img  → opens the AttachmentViewer modal
                    - other    → opens the presigned URL in a new tab (download)
                */}
                {isMissing ? (
                  <button
                    type="button"
                    onClick={() => (canWrite ? triggerReupload(att.id) : undefined)}
                    disabled={!canWrite}
                    className="text-left text-destructive hover:underline font-medium truncate disabled:cursor-not-allowed"
                    data-testid={`linked-lease-attachment-reupload-trigger-${att.id}`}
                    title={canWrite ? `Re-upload ${att.filename}` : att.filename}
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
            </div>

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

            {isMissing ? (
              <div
                className="flex items-center gap-2 text-xs text-destructive"
                role="alert"
                data-testid={`linked-lease-attachment-${att.id}-missing`}
              >
                <AlertTriangle size={14} aria-hidden="true" />
                <span>File missing from storage.</span>
                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => triggerReupload(att.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-muted min-h-[28px]"
                    data-testid={`linked-lease-attachment-${att.id}-reupload`}
                  >
                    <Upload size={12} aria-hidden="true" /> Re-upload
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
