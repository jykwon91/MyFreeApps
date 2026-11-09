import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Upload, X } from "lucide-react";
import { LoadingButton, showError, showSuccess } from "@platform/ui";
import {
  useCreateLeaseTemplateMutation,
  useSuggestPlaceholdersMutation,
} from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import { LEASE_TEMPLATE_CREATE_COPY } from "@mybookkeeper/api-client/constants/leaseTemplateCreateCopy";
import {
  LEASE_TEMPLATE_ACCEPT,
  LEASE_TEMPLATE_EXTENSIONS_LABEL,
  LEASE_TEMPLATE_UPLOAD_PROBLEMS,
} from "@mybookkeeper/api-client/constants/leaseTemplateUpload";
import type { LeaseTemplateDetail } from "@mybookkeeper/api-client/types/lease/lease-template-detail";
import type { SuggestPlaceholdersResponse } from "@mybookkeeper/api-client/types/lease/suggest-placeholders-response";
import { leaseTemplateFailureMessage } from "@mybookkeeper/api-client/utils/leaseTemplateFailureMessage";
import { leaseTemplateUploadProblems } from "@mybookkeeper/api-client/utils/leaseTemplateUploadForm";

export interface LeaseTemplateUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (
    template: LeaseTemplateDetail,
    aiSuggestions: SuggestPlaceholdersResponse | null,
  ) => void;
}

type UploadStep = "form" | "suggesting";

/**
 * Modal for creating a new lease template by uploading a bundle of files.
 *
 * Phase 2 addition: after the template is created, a second AI pass runs to
 * suggest placeholder names, types, and descriptions. The user sees a short
 * "Hmm, let me read this through…" loader while we wait, then the parent page
 * receives both the template and the AI suggestions so it can pre-fill the
 * PlaceholderSpecEditor for review.
 *
 * If the AI pass fails, the flow continues normally with the regex-extracted
 * placeholders — the error is swallowed gracefully.
 */
export default function LeaseTemplateUploadDialog({
  open,
  onOpenChange,
  onCreated,
}: LeaseTemplateUploadDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState<UploadStep>("form");

  const [createTemplate, { isLoading: isCreating }] =
    useCreateLeaseTemplateMutation();
  const [suggestPlaceholders] = useSuggestPlaceholdersMutation();

  const isLoading = isCreating || step === "suggesting";

  function reset() {
    setName("");
    setDescription("");
    setFiles([]);
    setIsDragging(false);
    setStep("form");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problems = leaseTemplateUploadProblems(name, files);
    const problem = problems.name ?? problems.files;
    if (problem) {
      showError(LEASE_TEMPLATE_UPLOAD_PROBLEMS[problem]);
      return;
    }
    const form = new FormData();
    form.append("name", name.trim());
    if (description.trim()) form.append("description", description.trim());
    for (const file of files) form.append("files", file);
    let template: LeaseTemplateDetail;
    try {
      template = await createTemplate(form).unwrap();
    } catch (e: unknown) {
      showError(leaseTemplateFailureMessage(e, LEASE_TEMPLATE_CREATE_COPY).message);
      return;
    }

    // AI suggestion pass — show loader, fail gracefully.
    setStep("suggesting");
    let aiSuggestions: SuggestPlaceholdersResponse | null = null;
    try {
      aiSuggestions = await suggestPlaceholders(template.id).unwrap();
    } catch {
      // AI suggestion failure is non-fatal — continue with regex placeholders.
    }

    showSuccess(`${template.name} created.`);
    reset();
    onOpenChange(false);
    onCreated?.(template, aiSuggestions);
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
            <code className="mx-1 px-1 py-0.5 rounded bg-muted text-xs">
              [TENANT FULL NAME]
            </code>
            so you can fill them in per applicant later.
          </Dialog.Description>

          {step === "suggesting" ? (
            <div
              className="py-8 flex flex-col items-center gap-3 text-center"
              data-testid="ai-suggesting-loader"
              aria-live="polite"
            >
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">
                Hmm, let me read this through and find the placeholders…
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="template-name"
                  className="block text-sm font-medium mb-1"
                >
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
                <label
                  htmlFor="template-description"
                  className="block text-sm font-medium mb-1"
                >
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
                  setFiles((prev) => [
                    ...prev,
                    ...Array.from(e.dataTransfer.files),
                  ]);
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
                      accept={LEASE_TEMPLATE_ACCEPT}
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
                  {LEASE_TEMPLATE_EXTENSIONS_LABEL}
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
          )}

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
