import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Upload, X } from "lucide-react";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useCreateLeaseTemplateMutation } from "@/shared/store/leaseTemplatesApi";
import type { LeaseTemplateDetail } from "@/shared/types/lease/lease-template-detail";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (template: LeaseTemplateDetail) => void;
}

const ACCEPTED_TYPES = ".md,.txt,.docx,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Modal for creating a new lease template by uploading a bundle of files.
 *
 * Drag-drop or click-to-select supports multi-file. The backend extracts
 * placeholders synchronously and returns the populated template; the parent
 * page navigates to the detail view via ``onCreated``.
 */
export default function LeaseTemplateUploadDialog({
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [createTemplate, { isLoading }] = useCreateLeaseTemplateMutation();

  function reset() {
    setName("");
    setDescription("");
    setFiles([]);
    setIsDragging(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      showError("Please name this template.");
      return;
    }
    if (files.length === 0) {
      showError("Please add at least one file.");
      return;
    }
    try {
      const template = await createTemplate({
        name: name.trim(),
        description: description.trim() || undefined,
        files,
      }).unwrap();
      showSuccess(`${template.name} created.`);
      reset();
      onOpenChange(false);
      onCreated?.(template);
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if (status === 413) showError("One of those files is too large.");
      else if (status === 415)
        showError("Unsupported file type. Allowed: .md, .txt, .docx");
      else if (status === 503)
        showError("Storage isn't available right now.");
      else showError("Couldn't create the template. Want to try again?");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content
          data-testid="lease-template-upload-dialog"
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto"
        >
          <Dialog.Title className="text-lg font-semibold mb-1">
            New lease template
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mb-4">
            Upload one or more files. I'll detect bracketed placeholders like
            <code className="mx-1 px-1 py-0.5 rounded bg-muted text-xs">[TENANT FULL NAME]</code>
            so you can fill them in per applicant later.
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="template-name" className="block text-sm font-medium mb-1">
                Template name
              </label>
              <input
                id="template-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-md"
                placeholder="Default lease bundle"
                required
                data-testid="template-name-input"
              />
            </div>

            <div>
              <label htmlFor="template-description" className="block text-sm font-medium mb-1">
                Description (optional)
              </label>
              <textarea
                id="template-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-md"
                placeholder="Used for short-term furnished rentals."
                rows={2}
              />
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
                setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
              }}
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                isDragging ? "border-primary bg-primary/5" : "border-border"
              }`}
              data-testid="template-file-dropzone"
            >
              <Upload size={20} className="mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Drag & drop files here or
                <label className="ml-1 text-primary font-medium hover:underline cursor-pointer">
                  browse
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    accept={ACCEPTED_TYPES}
                    onChange={(e) => {
                      const next = Array.from(e.target.files ?? []);
                      if (next.length > 0)
                        setFiles((prev) => [...prev, ...next]);
                      e.target.value = "";
                    }}
                  />
                </label>
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                .md, .txt, .docx
              </p>
            </div>

            {files.length > 0 ? (
              <ul className="space-y-1 text-sm" data-testid="template-file-list">
                {files.map((f, idx) => (
                  <li
                    key={`${f.name}-${idx}`}
                    className="flex items-center justify-between border rounded px-3 py-1.5"
                  >
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setFiles((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
                className="px-3 py-2 text-sm text-muted-foreground hover:underline"
              >
                Cancel
              </button>
              <LoadingButton
                type="submit"
                isLoading={isLoading}
                loadingText="Uploading..."
                data-testid="template-upload-submit"
              >
                Upload
              </LoadingButton>
            </div>
          </form>

          <Dialog.Close
            className="absolute top-3 right-3 rounded-md p-1 hover:bg-muted transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X size={18} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
