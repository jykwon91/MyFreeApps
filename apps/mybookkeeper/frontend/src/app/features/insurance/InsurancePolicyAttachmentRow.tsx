import { Download, Trash2 } from "lucide-react";
import {
  INSURANCE_ATTACHMENT_KIND_LABELS,
  type InsuranceAttachmentKind,
} from "@/shared/types/insurance/insurance-attachment-kind";
import type { InsurancePolicyAttachment } from "@/shared/types/insurance/insurance-policy-attachment";

export interface InsurancePolicyAttachmentRowProps {
  att: InsurancePolicyAttachment;
  canWrite: boolean;
  onPreview: () => void;
  onDelete: () => void;
}

export default function InsurancePolicyAttachmentRow({
  att,
  canWrite,
  onPreview,
  onDelete,
}: InsurancePolicyAttachmentRowProps) {
  const canPreview =
    att.presigned_url !== null &&
    (att.content_type === "application/pdf" || att.content_type.startsWith("image/"));

  return (
    <li
      className="border rounded-md px-3 py-2 text-sm space-y-1"
      data-testid={`insurance-attachment-${att.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        {canPreview ? (
          <button
            type="button"
            onClick={onPreview}
            className="truncate text-left text-primary hover:underline font-medium min-w-0"
            data-testid={`insurance-attachment-preview-${att.id}`}
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
              data-testid={`insurance-attachment-download-${att.id}`}
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
              data-testid={`insurance-attachment-delete-${att.id}`}
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
      </div>

      <span className="text-xs text-muted-foreground">
        {INSURANCE_ATTACHMENT_KIND_LABELS[att.kind as InsuranceAttachmentKind] ?? att.kind}
      </span>
    </li>
  );
}
