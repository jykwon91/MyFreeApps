import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  LEASE_ATTACHMENT_KINDS,
  type LeaseAttachmentKind,
} from "@/shared/types/lease/lease-attachment-kind";
import { LEASE_ATTACHMENT_KIND_LABELS } from "@/shared/lib/lease-labels";
import { useUploadSignedLeaseAttachmentMutation } from "@/shared/store/signedLeasesApi";
import { inferKindsForFiles } from "@/shared/lib/infer-attachment-kind";

const ALLOWED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export interface LeaseAttachmentDropzoneProps {
  leaseId: string;
  /** Called after all files in a batch have been uploaded successfully. */
  onUploaded?: (count: number) => void;
  disabled?: boolean;
}

export default function LeaseAttachmentDropzone({
  leaseId,
  onUploaded,
  disabled = false,
}: LeaseAttachmentDropzoneProps) {
  const [uploadAttachment, { isLoading: isUploading }] =
    useUploadSignedLeaseAttachmentMutation();

  const [manualKind, setManualKind] = useState<LeaseAttachmentKind>("signed_lease");
  const [isDragging, setIsDragging] = useState(false);
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

    const kinds: LeaseAttachmentKind[] =
      validFiles.length > 1
        ? inferKindsForFiles(validFiles.map((f) => f.name))
        : [manualKind];

    let successCount = 0;
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const kind = kinds[i];
      try {
        await uploadAttachment({ leaseId, file, kind }).unwrap();
        showSuccess(`${file.name} uploaded.`);
        successCount++;
      } catch (e: unknown) {
        const status = (e as { status?: number }).status;
        if (status === 413) showError(`${file.name} is too large.`);
        else if (status === 415) showError(`${file.name}: unsupported file type.`);
        else showError(`Couldn't upload ${file.name}.`);
      }
    }

    if (successCount > 0) {
      onUploaded?.(successCount);
    }
  }

  const isDisabled = disabled || isUploading;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label htmlFor={`attachment-kind-${leaseId}`} className="text-xs font-medium">
          Kind (single file):
        </label>
        <select
          id={`attachment-kind-${leaseId}`}
          value={manualKind}
          onChange={(e) => setManualKind(e.target.value as LeaseAttachmentKind)}
          className="px-2 py-1 text-sm border rounded"
          data-testid="lease-attachment-kind-select"
          disabled={isDisabled}
        >
          {LEASE_ATTACHMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {LEASE_ATTACHMENT_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground/70">
        Dropping multiple files auto-detects kind from filename.
      </p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!isDisabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (isDisabled) return;
          const files = Array.from(e.dataTransfer.files);
          if (files.length > 0) void handleFiles(files);
        }}
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
          isDragging ? "border-primary bg-primary/5" : "border-border"
        } ${isDisabled ? "opacity-50 pointer-events-none" : ""}`}
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
  );
}
