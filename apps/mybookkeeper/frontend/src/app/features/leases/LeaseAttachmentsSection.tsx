import { useRef, useState } from "react";
import { Download, Loader2, Trash2, Upload } from "lucide-react";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  LEASE_ATTACHMENT_KIND_LABELS,
} from "@/shared/lib/lease-labels";
import {
  LEASE_ATTACHMENT_KINDS,
  type LeaseAttachmentKind,
} from "@/shared/types/lease/lease-attachment-kind";
import {
  useDeleteSignedLeaseAttachmentMutation,
  useUploadSignedLeaseAttachmentMutation,
} from "@/shared/store/signedLeasesApi";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";

interface Props {
  leaseId: string;
  attachments: SignedLeaseAttachment[];
  canWrite: boolean;
}

const ALLOWED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export default function LeaseAttachmentsSection({ leaseId, attachments, canWrite }: Props) {
  const [uploadAttachment, { isLoading: isUploading }] =
    useUploadSignedLeaseAttachmentMutation();
  const [deleteAttachment] = useDeleteSignedLeaseAttachmentMutation();
  const [kind, setKind] = useState<LeaseAttachmentKind>("signed_lease");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Group attachments by kind for display.
  const groups: Record<string, SignedLeaseAttachment[]> = {};
  for (const att of attachments) {
    (groups[att.kind] ??= []).push(att);
  }

  async function handleFiles(files: File[]) {
    for (const file of files) {
      if (file.type && !ALLOWED_MIME.includes(file.type)) {
        showError(`${file.name}: unsupported file type.`);
        continue;
      }
      try {
        await uploadAttachment({ leaseId, file, kind }).unwrap();
        showSuccess(`${file.name} uploaded.`);
      } catch (e: unknown) {
        const status = (e as { status?: number }).status;
        if (status === 413) showError(`${file.name} is too large.`);
        else if (status === 415) showError(`${file.name}: unsupported file type.`);
        else showError(`Couldn't upload ${file.name}.`);
      }
    }
  }

  async function handleDelete(att: SignedLeaseAttachment) {
    if (!window.confirm(`Remove ${att.filename}?`)) return;
    try {
      await deleteAttachment({ leaseId, attachmentId: att.id }).unwrap();
      showSuccess("Attachment removed.");
    } catch {
      showError("Couldn't remove that file.");
    }
  }

  return (
    <section className="space-y-3">
      {Object.keys(groups).length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="lease-attachments-empty">
          No attachments yet.
        </p>
      ) : (
        Object.entries(groups).map(([groupKind, items]) => (
          <div key={groupKind} className="space-y-1">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              {LEASE_ATTACHMENT_KIND_LABELS[groupKind as LeaseAttachmentKind]}
            </h3>
            <ul className="space-y-1">
              {items.map((att) => (
                <li
                  key={att.id}
                  className="flex items-center justify-between border rounded-md px-3 py-2 text-sm"
                  data-testid={`lease-attachment-${att.id}`}
                >
                  <span className="truncate">{att.filename}</span>
                  <div className="flex items-center gap-3">
                    {att.presigned_url ? (
                      <a
                        href={att.presigned_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                      >
                        <Download size={14} />
                        Download
                      </a>
                    ) : null}
                    {canWrite ? (
                      <button
                        type="button"
                        onClick={() => void handleDelete(att)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${att.filename}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {canWrite ? (
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center gap-2">
            <label htmlFor="attachment-kind" className="text-xs font-medium">
              Kind:
            </label>
            <select
              id="attachment-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as LeaseAttachmentKind)}
              className="px-2 py-1 text-sm border rounded"
              data-testid="lease-attachment-kind-select"
            >
              {LEASE_ATTACHMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {LEASE_ATTACHMENT_KIND_LABELS[k]}
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
            data-testid="lease-attachment-dropzone"
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
                  Drag & drop a signed lease, inspection, or document here, or
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="ml-1 text-primary font-medium hover:underline"
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
    </section>
  );
}
