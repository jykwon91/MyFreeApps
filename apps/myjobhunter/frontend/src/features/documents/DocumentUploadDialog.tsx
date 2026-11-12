import { useState, useRef } from "react";
import { LoadingButton, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import { DOCUMENT_TITLE_MAX_LENGTH } from "@myjobhunter/api-client/constants/documentFieldLimits";
import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import DocumentTitleField from "./DocumentTitleField";
import type { DocumentKind } from "@myjobhunter/api-client/types/document/document-kind";
import { DOCUMENT_KIND_OPTIONS } from "@myjobhunter/api-client/constants/documentKindOptions";
import { DOCUMENT_UPLOAD_EXTENSIONS, DOCUMENT_UPLOAD_MIME_TYPES } from "@myjobhunter/api-client/constants/documentUploadLimits";
import { fillDocumentUploadForm } from "@myjobhunter/api-client/utils/fillDocumentUploadForm";
import { useCreateDocumentMutation, useUploadDocumentMutation } from "@myjobhunter/api-client/store/documentsApi";

export interface DocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-set the application link on creation. */
  applicationId?: string;
}

type CreateMode = "text" | "file";

export default function DocumentUploadDialog({
  open,
  onOpenChange,
  applicationId,
}: DocumentUploadDialogProps) {
  const [mode, setMode] = useState<CreateMode>("file");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<DocumentKind>("cover_letter");
  const [body, setBody] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [createDocument, { isLoading: creatingText }] = useCreateDocumentMutation();
  const [uploadDocument, { isLoading: uploading }] = useUploadDocumentMutation();

  const isLoading = creatingText || uploading;
  const titleProblem = tooLongProblem(title, DOCUMENT_TITLE_MAX_LENGTH);

  function reset() {
    setTitle("");
    setKind("cover_letter");
    setBody("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (titleProblem) return;
    try {
      if (mode === "text") {
        await createDocument({
          title,
          kind,
          application_id: applicationId ?? null,
          body,
        }).unwrap();
      } else {
        if (!selectedFile) {
          showError("Please select a file");
          return;
        }
        const form = new FormData();
        fillDocumentUploadForm(form, {
          title,
          kind,
          application_id: applicationId ?? null,
          file: selectedFile,
        });
        await uploadDocument(form).unwrap();
      }
      showSuccess("Document created");
      reset();
      onOpenChange(false);
    } catch (err) {
      showError(`Couldn't create document: ${extractErrorMessage(err)}`);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="bg-background border rounded-xl shadow-lg w-full max-w-lg mx-4 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Add Document</h2>

        {/* Mode toggle */}
        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          <button
            type="button"
            onClick={() => setMode("file")}
            className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
              mode === "file" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            Upload file
          </button>
          <button
            type="button"
            onClick={() => setMode("text")}
            className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
              mode === "text" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            Write text
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <DocumentTitleField
            id="new-doc-title"
            value={title}
            onChange={setTitle}
            error={titleProblem}
            placeholder="e.g. Cover letter for Acme Corp"
          />

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="new-doc-kind">
              Type
            </label>
            <select
              id="new-doc-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as DocumentKind)}
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            >
              {DOCUMENT_KIND_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {mode === "file" ? (
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="new-doc-file">
                File <span className="font-normal text-muted-foreground">(PDF, DOCX, or TXT — max 25 MB)</span>
              </label>
              <input
                id="new-doc-file"
                ref={fileInputRef}
                type="file"
                accept={[...DOCUMENT_UPLOAD_EXTENSIONS, ...DOCUMENT_UPLOAD_MIME_TYPES].join(",")}
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm"
              />
              {selectedFile ? (
                <p className="text-xs text-muted-foreground">
                  {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="new-doc-body">
                Content
              </label>
              <textarea
                id="new-doc-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                rows={8}
                placeholder="Write your document content here..."
                className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-y font-mono"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
            >
              Cancel
            </button>
            <LoadingButton type="submit" isLoading={isLoading}>
              {mode === "file" ? "Upload" : "Create"}
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
}
