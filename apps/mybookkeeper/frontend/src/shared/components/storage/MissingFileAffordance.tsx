import { useRef } from "react";
import { AlertTriangle, Upload } from "lucide-react";

/**
 * Renders when a stored attachment's underlying object is gone (NoSuchKey).
 * Shows a destructive-styled "File missing" alert plus an optional
 * "Re-upload" button that opens a file picker. The parent decides what to
 * do with the picked file (typically: delete the orphan row, then upload
 * the new file under the same kind).
 *
 * Used across every domain that surfaces stored files: lease attachments,
 * lease receipts, insurance attachments, listing-blackout attachments,
 * listing photos, screening-result PDFs, lease-template files.
 */
export interface MissingFileAffordanceProps {
  /** Whether the current user can perform the re-upload (write access). */
  canReupload: boolean;
  /** Callback when the user picks a replacement file. */
  onReupload: (file: File) => void;
  /** Comma-separated MIME types passed to the hidden file input's accept attr. */
  acceptMime: string;
  /**
   * Prefix used for the `data-testid` attributes on the alert and the
   * re-upload button. Each domain passes a stable prefix so tests can
   * target rows without colliding (e.g. `lease-attachment-${id}`).
   */
  testIdPrefix: string;
}

export default function MissingFileAffordance({
  canReupload,
  onReupload,
  acceptMime,
  testIdPrefix,
}: MissingFileAffordanceProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className="flex items-center gap-2 text-xs text-destructive"
      role="alert"
      data-testid={`${testIdPrefix}-missing`}
    >
      <AlertTriangle size={14} aria-hidden="true" />
      <span>File missing from storage.</span>
      {canReupload ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-muted min-h-[28px]"
          data-testid={`${testIdPrefix}-reupload`}
        >
          <Upload size={12} aria-hidden="true" /> Re-upload
        </button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={acceptMime}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onReupload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
