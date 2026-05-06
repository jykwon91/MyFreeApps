import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  INSURANCE_ATTACHMENT_KINDS,
  INSURANCE_ATTACHMENT_KIND_LABELS,
  type InsuranceAttachmentKind,
} from "@/shared/types/insurance/insurance-attachment-kind";
import {
  useDeleteInsurancePolicyAttachmentMutation,
  useUploadInsurancePolicyAttachmentMutation,
} from "@/shared/store/insurancePoliciesApi";
import type { InsurancePolicyAttachment } from "@/shared/types/insurance/insurance-policy-attachment";
import AttachmentViewer from "@/app/features/leases/AttachmentViewer";
import InsurancePolicyAttachmentRow from "@/app/features/insurance/InsurancePolicyAttachmentRow";

export interface InsurancePolicyAttachmentsSectionProps {
  policyId: string;
  attachments: InsurancePolicyAttachment[];
  canWrite: boolean;
}

const ALLOWED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export default function InsurancePolicyAttachmentsSection({
  policyId,
  attachments,
  canWrite,
}: InsurancePolicyAttachmentsSectionProps) {
  const [uploadAttachment, { isLoading: isUploading }] =
    useUploadInsurancePolicyAttachmentMutation();
  const [deleteAttachment] = useDeleteInsurancePolicyAttachmentMutation();

  const [manualKind, setManualKind] = useState<InsuranceAttachmentKind>("policy_document");
  const [isDragging, setIsDragging] = useState(false);
  const [viewingAttachment, setViewingAttachment] =
    useState<InsurancePolicyAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: File[]) {
    const validFiles = files.filter((file) => {
      if (file.type && !ALLOWED_MIME.includes(file.type)) {
        showError(`${file.name}: unsupported file type.`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    for (const file of validFiles) {
      try {
        await uploadAttachment({ policyId, file, kind: manualKind }).unwrap();
        showSuccess(`${file.name} uploaded.`);
      } catch (e: unknown) {
        const status = (e as { status?: number }).status;
        if (status === 413) showError(`${file.name} is too large.`);
        else if (status === 415) showError(`${file.name}: unsupported file type.`);
        else showError(`Couldn't upload ${file.name}.`);
      }
    }
  }

  async function handleDelete(att: InsurancePolicyAttachment) {
    if (!window.confirm(`Remove ${att.filename}?`)) return;
    try {
      await deleteAttachment({ policyId, attachmentId: att.id }).unwrap();
      showSuccess("Attachment removed.");
    } catch {
      showError("Couldn't remove that file.");
    }
  }

  async function handleReupload(att: InsurancePolicyAttachment, file: File) {
    if (file.type && !ALLOWED_MIME.includes(file.type)) {
      showError(`${file.name}: unsupported file type.`);
      return;
    }
    try {
      await deleteAttachment({ policyId, attachmentId: att.id }).unwrap();
    } catch {
      showError("Couldn't remove the broken file. Please try again.");
      return;
    }
    try {
      await uploadAttachment({ policyId, file, kind: att.kind }).unwrap();
      showSuccess(`${file.name} uploaded.`);
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if (status === 413) showError(`${file.name} is too large.`);
      else if (status === 415) showError(`${file.name}: unsupported file type.`);
      else showError(`Couldn't upload ${file.name}.`);
    }
  }

  return (
    <section className="space-y-3" data-testid="insurance-attachments-section">
      {attachments.length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="insurance-attachments-empty"
        >
          No attachments yet.
        </p>
      ) : (
        <ul className="space-y-1" data-testid="insurance-attachments-list">
          {attachments.map((att) => (
            <InsurancePolicyAttachmentRow
              key={att.id}
              att={att}
              canWrite={canWrite}
              onPreview={() => setViewingAttachment(att)}
              onDelete={() => void handleDelete(att)}
              onReupload={(file) => void handleReupload(att, file)}
            />
          ))}
        </ul>
      )}

      {canWrite ? (
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center gap-2">
            <label htmlFor="insurance-attachment-kind" className="text-xs font-medium">
              Kind:
            </label>
            <select
              id="insurance-attachment-kind"
              value={manualKind}
              onChange={(e) => setManualKind(e.target.value as InsuranceAttachmentKind)}
              className="px-2 py-1 text-sm border rounded"
              data-testid="insurance-attachment-kind-select"
            >
              {INSURANCE_ATTACHMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {INSURANCE_ATTACHMENT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const files = Array.from(e.dataTransfer.files);
              if (files.length > 0) void handleFiles(files);
            }}
            className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-border"
            } ${isUploading ? "opacity-50 pointer-events-none" : ""}`}
            data-testid="insurance-attachment-dropzone"
          >
            {isUploading ? (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                Uploading...
              </span>
            ) : (
              <div>
                <Upload size={16} className="mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">
                  Drag & drop your policy document here, or{" "}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-primary font-medium hover:underline"
                  >
                    browse
                  </button>
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  PDF, DOCX, JPEG, PNG, WebP
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept={ALLOWED_MIME.join(",")}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) void handleFiles(files);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      ) : null}

      {viewingAttachment?.presigned_url ? (
        <AttachmentViewer
          url={viewingAttachment.presigned_url}
          filename={viewingAttachment.filename}
          contentType={viewingAttachment.content_type}
          onClose={() => setViewingAttachment(null)}
        />
      ) : null}
    </section>
  );
}
