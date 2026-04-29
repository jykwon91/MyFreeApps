import { useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Button from "@/shared/components/ui/Button";
import FormField from "@/shared/components/ui/FormField";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useUploadScreeningResultMutation } from "@/shared/store/screeningApi";
import {
  ADVERSE_OUTCOMES,
  SCREENING_STATUSES,
  SCREENING_STATUS_LABELS,
  type ScreeningStatus,
} from "@/shared/types/screening/screening-status";

interface Props {
  applicantId: string;
  open: boolean;
  onClose: () => void;
}

const ADVERSE_SET = new Set<ScreeningStatus>(ADVERSE_OUTCOMES);

function isAdverseOutcome(status: ScreeningStatus): boolean {
  return ADVERSE_SET.has(status);
}

/**
 * Modal for uploading a completed KeyCheck report.
 *
 * Required: PDF file + status. Adverse-action snippet is conditionally
 * required (and only shown) when status is ``fail`` or ``inconclusive`` —
 * the regulator cares about declined/inconclusive outcomes for FCRA
 * adverse-action notices, so the host must enter a short reason.
 *
 * Validation runs client-side first; the backend re-validates and returns
 * 422 on the same conditions if the host bypasses the form.
 */
export default function UploadScreeningResultModal({
  applicantId,
  open,
  onClose,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ScreeningStatus | "">("");
  const [adverseSnippet, setAdverseSnippet] = useState<string>("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [uploadResult, { isLoading }] = useUploadScreeningResultMutation();

  function reset(): void {
    setFile(null);
    setStatus("");
    setAdverseSnippet("");
    setSubmitAttempted(false);
  }

  function handleClose(): void {
    if (isLoading) {
      return;
    }
    reset();
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitAttempted(true);

    if (!file) {
      showError("Please choose a report PDF to upload.");
      return;
    }
    if (!status) {
      showError("Please choose the screening outcome.");
      return;
    }
    if (isAdverseOutcome(status) && !adverseSnippet.trim()) {
      showError(
        "Please enter a short reason for the adverse outcome — required for FCRA records.",
      );
      return;
    }

    try {
      await uploadResult({
        applicantId,
        file,
        status,
        adverseActionSnippet: isAdverseOutcome(status)
          ? adverseSnippet.trim()
          : null,
      }).unwrap();
      showSuccess("Report uploaded.");
      reset();
      onClose();
    } catch {
      showError("I couldn't upload that report. Please check the file and try again.");
    }
  }

  const showSnippetField = status !== "" && isAdverseOutcome(status);

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content
          data-testid="upload-screening-modal"
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-md rounded-lg border bg-card p-6 shadow-lg"
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <Dialog.Title className="text-base font-semibold">
                Upload screening report
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground mt-1">
                Attach the PDF you downloaded from KeyCheck and record the
                outcome.
              </Dialog.Description>
            </div>
            <button
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center rounded"
              aria-label="Close upload screening modal"
              type="button"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Report PDF" required>
              <input
                data-testid="upload-screening-file"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
              {submitAttempted && !file ? (
                <p className="text-xs text-red-500 mt-1">A PDF is required.</p>
              ) : null}
            </FormField>

            <FormField label="Outcome" required>
              <select
                data-testid="upload-screening-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as ScreeningStatus | "")}
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[44px]"
              >
                <option value="">— Choose outcome —</option>
                {SCREENING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {SCREENING_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              {submitAttempted && !status ? (
                <p className="text-xs text-red-500 mt-1">Please choose an outcome.</p>
              ) : null}
            </FormField>

            {showSnippetField ? (
              <FormField label="Adverse action reason" required>
                <textarea
                  data-testid="upload-screening-snippet"
                  value={adverseSnippet}
                  onChange={(e) => setAdverseSnippet(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Short summary used on the FCRA adverse-action notice (e.g. 'Credit score below threshold')."
                  className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                {submitAttempted && !adverseSnippet.trim() ? (
                  <p className="text-xs text-red-500 mt-1">
                    Required for declined / inconclusive outcomes.
                  </p>
                ) : null}
              </FormField>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <LoadingButton
                data-testid="upload-screening-submit"
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isLoading}
                loadingText="Uploading..."
              >
                Upload report
              </LoadingButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
