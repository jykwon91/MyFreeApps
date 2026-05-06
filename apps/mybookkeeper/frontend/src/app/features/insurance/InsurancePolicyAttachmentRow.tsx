import { useRef } from "react";
import { Download, Trash2 } from "lucide-react";
import {
  INSURANCE_ATTACHMENT_KIND_LABELS,
  type InsuranceAttachmentKind,
} from "@/shared/types/insurance/insurance-attachment-kind";
import type { InsurancePolicyAttachment } from "@/shared/types/insurance/insurance-policy-attachment";
import { LEASE_REUPLOAD_ACCEPT } from "@/shared/lib/lease-reupload-accept";
import { reportMissingStorageObject } from "@/shared/lib/storage-observability";

export interface InsurancePolicyAttachmentRowProps {
  att: InsurancePolicyAttachment;
  canWrite: boolean;
  onPreview: () => void;
  onDelete: () => void;
  onReupload: (file: File) => void;
}

export default function InsurancePolicyAttachmentRow({
  att,
  canWrite,
  onPreview,
  onDelete,
  onReupload,
}: InsurancePolicyAttachmentRowProps) {
  const reuploadInputRef = useRef<HTMLInputElement>(null);
  const isMissing = att.is_available === false;
  const canPreviewInline =
    !isMissing
    && att.presigned_url !== null
    && (att.content_type === "application/pdf" || att.content_type.startsWith("image/"));
  const triggerReupload = () => reuploadInputRef.current?.click();

  function handleMissingClick() {
    reportMissingStorageObject({
      domain: "insurance_attachment",
      attachment_id: att.id,
      storage_key: att.storage_key,
      parent_id: att.policy_id,
      parent_kind: "insurance_policy",
    });
    if (canWrite) triggerReupload();
  }

  return (
    <li
      className="border rounded-md px-3 py-2 text-sm space-y-1"
      data-testid={`insurance-attachment-${att.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        {isMissing ? (
          <button
            type="button"
            onClick={handleMissingClick}
            className="truncate text-left text-primary hover:underline font-medium min-w-0"
            data-testid={`insurance-attachment-preview-${att.id}`}
            title={att.filename}
          >
            {att.filename}
          </button>
        ) : canPreviewInline ? (
          <button
            type="button"
            onClick={onPreview}
            className="truncate text-left text-primary hover:underline font-medium min-w-0"
            data-testid={`insurance-attachment-preview-${att.id}`}
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
            data-testid={`insurance-attachment-download-link-${att.id}`}
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

      <span className="text-xs text-muted-foreground">
        {INSURANCE_ATTACHMENT_KIND_LABELS[att.kind as InsuranceAttachmentKind] ?? att.kind}
      </span>
    </li>
  );
}
