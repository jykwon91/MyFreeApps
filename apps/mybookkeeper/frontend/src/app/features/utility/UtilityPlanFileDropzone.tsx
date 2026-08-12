import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { MAX_UPLOAD_MB } from "@/shared/lib/utility-plan-read-errors";

/** Formats the reader will accept. Matches the backend's content sniff. */
const ACCEPTED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export interface UtilityPlanFileDropzoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

/**
 * Pick the plan document off the device.
 *
 * No ``capture`` attribute on purpose — leaving it off is what makes iOS offer
 * Photo Library / Take Photo / Browse from one control, which covers every way
 * an operator actually has an Electricity Facts Label to hand.
 */
export default function UtilityPlanFileDropzone({
  onFile,
  disabled = false,
}: UtilityPlanFileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const borderTone = isDragging ? "border-primary bg-primary/5" : "border-border";
  const enabledTone = disabled ? "opacity-50 pointer-events-none" : "";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (disabled) return;
        const [file] = Array.from(e.dataTransfer.files);
        if (file) onFile(file);
      }}
      className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${borderTone} ${enabledTone}`}
      data-testid="utility-plan-file-dropzone"
    >
      <Upload size={16} className="mx-auto text-muted-foreground mb-1" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="min-h-[44px] px-2 text-sm font-medium text-primary hover:underline"
        data-testid="utility-plan-choose-file-button"
      >
        Add a photo or PDF
      </button>
      <p className="text-xs text-muted-foreground/70">
        or drop one here · PDF, JPG, PNG, WEBP · up to {MAX_UPLOAD_MB}MB
      </p>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={ACCEPTED_MIME.join(",")}
        onChange={(e) => {
          const [file] = Array.from(e.target.files ?? []);
          if (file) onFile(file);
          // Re-picking the same file fires no change event unless the input is
          // cleared, and re-picking is exactly what someone does after a failed
          // read.
          e.target.value = "";
        }}
        data-testid="utility-plan-file-input"
      />
    </div>
  );
}
