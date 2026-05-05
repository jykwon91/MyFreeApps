import { useState, useEffect } from "react";
import { LoadingButton, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import type { Document } from "@/types/document/document";
import type { DocumentKind } from "@/types/document/document-kind";
import { DOCUMENT_KIND_OPTIONS } from "@/features/documents/document-kind-labels";
import { useUpdateDocumentMutation } from "@/lib/documentsApi";

export interface DocumentEditDialogProps {
  document: Document;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DocumentEditDialog({
  document,
  open,
  onOpenChange,
}: DocumentEditDialogProps) {
  const [title, setTitle] = useState(document.title);
  const [kind, setKind] = useState<DocumentKind>(document.kind);
  const [body, setBody] = useState(document.body ?? "");
  const [updateDocument, { isLoading }] = useUpdateDocumentMutation();

  // Sync state when the document prop changes (e.g. opening a different doc).
  useEffect(() => {
    setTitle(document.title);
    setKind(document.kind);
    setBody(document.body ?? "");
  }, [document.id, document.title, document.kind, document.body]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const patch: { title?: string; kind?: DocumentKind; body?: string } = {};
    if (title !== document.title) patch.title = title;
    if (kind !== document.kind) patch.kind = kind;
    // Only update body for text-body documents.
    if (!document.has_file && body !== (document.body ?? "")) patch.body = body;

    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }

    try {
      await updateDocument({ id: document.id, patch }).unwrap();
      showSuccess("Document updated");
      onOpenChange(false);
    } catch (err) {
      showError(`Couldn't update: ${extractErrorMessage(err)}`);
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
        <h2 className="text-lg font-semibold">Edit Document</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="edit-doc-title">
              Title
            </label>
            <input
              id="edit-doc-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="edit-doc-kind">
              Type
            </label>
            <select
              id="edit-doc-kind"
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

          {!document.has_file ? (
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="edit-doc-body">
                Content
              </label>
              <textarea
                id="edit-doc-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-y font-mono"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              File: <span className="font-medium">{document.filename}</span> — file content cannot
              be replaced. Create a new document to upload a different file.
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
            >
              Cancel
            </button>
            <LoadingButton type="submit" isLoading={isLoading}>
              Save changes
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
}
