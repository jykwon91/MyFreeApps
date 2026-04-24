import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import Spinner from "@/shared/components/icons/Spinner";

export interface FileUploadDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  maxSizeBytes?: number;
  multiple?: boolean;
  uploading?: boolean;
  disabled?: boolean;
  label?: string;
  helperText?: string;
  error?: string;
  className?: string;
}

const DEFAULT_LABEL = "Drop your resume here or click to browse";

function validateFiles(
  files: File[],
  accept?: string,
  maxSizeBytes?: number
): string | null {
  if (maxSizeBytes !== undefined) {
    const oversized = files.find((f) => f.size > maxSizeBytes);
    if (oversized) {
      const mb = (maxSizeBytes / (1024 * 1024)).toFixed(0);
      return `File "${oversized.name}" exceeds the ${mb}MB size limit.`;
    }
  }

  if (accept) {
    const allowed = accept
      .split(",")
      .map((a) => a.trim().toLowerCase());
    const invalid = files.find((f) => {
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      const mime = f.type.toLowerCase();
      return !allowed.some(
        (a) => a === ext || a === mime || (a.endsWith("/*") && mime.startsWith(a.slice(0, -1)))
      );
    });
    if (invalid) {
      return `File type not allowed: "${invalid.name}". Allowed: ${accept}`;
    }
  }

  return null;
}

export default function FileUploadDropzone({
  onFilesSelected,
  accept,
  maxSizeBytes,
  multiple = false,
  uploading = false,
  disabled = false,
  label = DEFAULT_LABEL,
  helperText,
  error,
  className,
}: FileUploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);

  const displayError = error ?? internalError;
  const isDisabled = disabled || uploading;

  function openPicker() {
    if (!isDisabled) {
      inputRef.current?.click();
    }
  }

  function processFiles(rawFiles: FileList | null) {
    if (!rawFiles || rawFiles.length === 0) return;
    const files = Array.from(rawFiles);
    const validationError = validateFiles(files, accept, maxSizeBytes);
    if (validationError) {
      setInternalError(validationError);
      return;
    }
    setInternalError(null);
    onFilesSelected(files);
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isDisabled) setIsDragging(true);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isDisabled) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isDisabled) return;
    processFiles(e.dataTransfer.files);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    processFiles(e.target.files);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        aria-label={label}
        aria-disabled={isDisabled}
        onClick={openPicker}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 transition-colors",
          isDragging && !isDisabled
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/30 hover:border-primary/50",
          isDisabled
            ? "opacity-50 cursor-not-allowed pointer-events-none"
            : "cursor-pointer"
        )}
      >
        {uploading ? (
          <>
            <Spinner className="w-8 h-8 text-primary" />
            <span className="text-sm text-muted-foreground">Uploading...</span>
          </>
        ) : (
          <>
            <UploadCloud
              className="text-muted-foreground"
              style={{ width: 40, height: 40 }}
              aria-hidden="true"
            />
            <div className="text-center">
              <p className="text-sm font-medium">{label}</p>
              {helperText && (
                <p className="text-xs text-muted-foreground mt-1">{helperText}</p>
              )}
            </div>
          </>
        )}
      </div>

      {displayError && (
        <p className="text-xs text-destructive" role="alert">
          {displayError}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={isDisabled}
        onChange={handleInputChange}
        aria-hidden="true"
        className="sr-only"
        tabIndex={-1}
      />
    </div>
  );
}
