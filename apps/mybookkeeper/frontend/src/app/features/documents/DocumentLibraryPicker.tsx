import type { Document } from "@/shared/types/document/document";

export interface DocumentLibraryPickerProps {
  documents: Document[];
  onPick: (documentId: string, name: string) => void;
  /** Namespaces the test ids so each domain's specs address their own card. */
  testIdPrefix: string;
  /** The owning dialog's input styling — each domain keeps its own constant. */
  inputClass: string;
  disabled?: boolean;
}

/**
 * The secondary way in: a file already in the document library.
 *
 * Collapsed, and rendered only when the library has something in it. It used to
 * be the only control here, which left anyone whose paperwork was still on
 * their phone staring at a dropdown with nothing in it. ``details`` rather than
 * a hand-rolled toggle so the expanded state is announced and keyboard-operable
 * without extra ARIA.
 */
export default function DocumentLibraryPicker({
  documents,
  onPick,
  testIdPrefix,
  inputClass,
  disabled = false,
}: DocumentLibraryPickerProps) {
  return (
    <details data-testid={`${testIdPrefix}-library-picker`}>
      <summary className="min-h-[44px] flex items-center cursor-pointer text-xs font-medium text-primary">
        Or pick one you've already uploaded ({documents.length})
      </summary>
      <select
        value=""
        onChange={(e) => {
          const picked = documents.find((d) => d.id === e.target.value);
          if (picked) onPick(picked.id, picked.file_name ?? "Untitled document");
        }}
        disabled={disabled}
        aria-label="Document"
        className={`${inputClass} mt-2`}
        data-testid={`${testIdPrefix}-document-select`}
      >
        <option value="">Select a document…</option>
        {documents.map((document) => (
          <option key={document.id} value={document.id}>
            {document.file_name ?? "Untitled document"}
          </option>
        ))}
      </select>
    </details>
  );
}
