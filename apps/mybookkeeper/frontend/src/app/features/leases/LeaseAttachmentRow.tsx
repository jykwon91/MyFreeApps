import { useRef } from "react";
import { Download, Trash2 } from "lucide-react";
import { LEASE_ATTACHMENT_KIND_LABELS } from "@/shared/lib/lease-labels";
import {
  LEASE_ATTACHMENT_KINDS,
  type LeaseAttachmentKind,
} from "@/shared/types/lease/lease-attachment-kind";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";
import { LEASE_REUPLOAD_ACCEPT } from "@/shared/lib/lease-reupload-accept";
import { reportMissingStorageObject } from "@/shared/lib/storage-observability";

export interface LeaseAttachmentRowProps {
  att: SignedLeaseAttachment;
  canWrite: boolean;
  onPreview: () => void;
  onDelete: () => void;
  onKindChange: (kind: LeaseAttachmentKind) => void;
  onReupload: (file: File) => void;
}

/**
 * Renders a lease attachment row with the filename ALWAYS clickable.
 * For broken (missing-from-storage) rows, the click silently opens the
 * re-upload picker; the operator sees the underlying NoSuchKey via
 * Sentry + PostHog + the Network tab. The user-facing UI never carries
 * a destructive "File missing" alert.
 */
export default function LeaseAttachmentRow({
  att,
  canWrite,
  onPreview,
  onDelete,
  onKindChange,
  onReupload,
}: LeaseAttachmentRowProps) {
  const reuploadInputRef = useRef<HTMLInputElement>(null);
  const isMissing = att.is_available === false;
  const canPreviewInline =
    !isMissing
    && att.presigned_url !== null
    && (att.content_type === "application/pdf" || att.content_type.startsWith("image/"));
  const triggerReupload = () => reuploadInputRef.current?.click();

  function handleMissingClick() {
    reportMissingStorageObject({
      domain: "lease_attachment",
      attachment_id: att.id,
      storage_key: att.storage_key,
      parent_id: att.lease_id,
      parent_kind: "signed_lease",
    });
    if (canWrite) triggerReupload();
  }

  return (
    <li
      className="border rounded-md px-3 py-2 text-sm space-y-1"
      data-testid={`lease-attachment-${att.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        {isMissing ? (
          <button
            type="button"
            onClick={handleMissingClick}
            className="truncate text-left text-primary hover:underline font-medium min-w-0"
            data-testid={`lease-attachment-preview-${att.id}`}
            title={att.filename}
          >
            {att.filename}
          </button>
        ) : canPreviewInline ? (
          <button
            type="button"
            onClick={onPreview}
            className="truncate text-left text-primary hover:underline font-medium min-w-0"
            data-testid={`lease-attachment-preview-${att.id}`}
            title={att.filename}
          >
            {att.filename}
          </button>
        ) : att.presigned_url ? (
          <a
            href={att.presigned_url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-left text-primary hover:underline font-medium min-w-0"
            data-testid={`lease-attachment-download-link-${att.id}`}
            title={att.filename}
          >
            {att.filename}
          </a>
        ) : (
          <span className="truncate text-muted-foreground min-w-0" title={att.filename}>
            {att.filename}
          </span>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {!isMissing && att.presigned_url ? (
            <a
              href={att.presigned_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Download ${att.filename}`}
              data-testid={`lease-attachment-download-${att.id}`}
            >
              <Download size={14} />
            </a>
          ) : null}
          {canWrite ? (
            <button
              type="button"
              onClick={onDelete}
              className="text-muted-foreground hover:text-destructive min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={`Delete ${att.filename}`}
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
      </div>

      <input
        ref={reuploadInputRef}
        type="file"
        className="hidden"
        accept={LEASE_REUPLOAD_ACCEPT}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onReupload(file);
          e.target.value = "";
        }}
      />

      <div className="flex items-center gap-2">
        {canWrite ? (
          <select
            value={att.kind}
            onChange={(e) => onKindChange(e.target.value as LeaseAttachmentKind)}
            className="px-2 py-0.5 text-xs border rounded text-muted-foreground bg-background"
            aria-label={`Kind for ${att.filename}`}
            data-testid={`lease-attachment-kind-picker-${att.id}`}
          >
            {LEASE_ATTACHMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {LEASE_ATTACHMENT_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-muted-foreground">
            {LEASE_ATTACHMENT_KIND_LABELS[att.kind as LeaseAttachmentKind]}
          </span>
        )}
      </div>
    </li>
  );
}
