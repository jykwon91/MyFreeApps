import { useRef } from "react";
import { AlertTriangle, Download, Trash2, Upload } from "lucide-react";
import { LEASE_ATTACHMENT_KIND_LABELS } from "@/shared/lib/lease-labels";
import {
  LEASE_ATTACHMENT_KINDS,
  type LeaseAttachmentKind,
} from "@/shared/types/lease/lease-attachment-kind";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";

export interface LeaseAttachmentRowProps {
  att: SignedLeaseAttachment;
  canWrite: boolean;
  onPreview: () => void;
  onDelete: () => void;
  onKindChange: (kind: LeaseAttachmentKind) => void;
  onReupload: (file: File) => void;
}

const REUPLOAD_ACCEPT = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
].join(",");

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
  const canPreview =
    !isMissing
    && att.presigned_url !== null
    && (att.content_type === "application/pdf" || att.content_type.startsWith("image/"));

  return (
    <li
      className="border rounded-md px-3 py-2 text-sm space-y-1"
      data-testid={`lease-attachment-${att.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        {canPreview ? (
          <button
            type="button"
            onClick={onPreview}
            className="truncate text-left text-primary hover:underline font-medium min-w-0"
            data-testid={`lease-attachment-preview-${att.id}`}
            title={att.filename}
          >
            {att.filename}
          </button>
        ) : (
          <span
            className={`truncate min-w-0 ${
              isMissing ? "text-destructive" : "text-muted-foreground"
            }`}
            title={att.filename}
          >
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

      {isMissing ? (
        <div
          className="flex items-center gap-2 text-xs text-destructive"
          data-testid={`lease-attachment-missing-${att.id}`}
          role="alert"
        >
          <AlertTriangle size={14} aria-hidden="true" />
          <span>File missing from storage.</span>
          {canWrite ? (
            <button
              type="button"
              onClick={() => reuploadInputRef.current?.click()}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-muted min-h-[28px]"
              data-testid={`lease-attachment-reupload-${att.id}`}
            >
              <Upload size={12} aria-hidden="true" /> Re-upload
            </button>
          ) : null}
          <input
            ref={reuploadInputRef}
            type="file"
            className="hidden"
            accept={REUPLOAD_ACCEPT}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onReupload(file);
              e.target.value = "";
            }}
          />
        </div>
      ) : null}

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
