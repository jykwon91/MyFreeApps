import { Download, Trash2 } from "lucide-react";
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
}

export default function LeaseAttachmentRow({ att, canWrite, onPreview, onDelete, onKindChange }: LeaseAttachmentRowProps) {
  const canPreview =
    att.presigned_url !== null &&
    (att.content_type === "application/pdf" || att.content_type.startsWith("image/"));

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
          <span className="truncate text-muted-foreground min-w-0" title={att.filename}>
            {att.filename}
          </span>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {att.presigned_url ? (
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
