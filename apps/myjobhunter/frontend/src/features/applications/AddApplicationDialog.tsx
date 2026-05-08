/**
 * AddApplicationDialog — orchestrator.
 *
 * Three-step state machine:
 *   1. INPUT       Operator pastes a URL (default), pastes JD text,
 *                  or types a company name for fully manual entry.
 *   2. PROCESSING  Spinner while the JD extract / parse mutation runs.
 *                  After 3s it swaps to "this is taking longer than usual…"
 *   3. REVIEW      The form is pre-filled (or empty for manual path);
 *                  the company is shown as a confirmation pill, NOT a
 *                  dropdown. Operator confirms / edits and submits.
 *
 * All state-machine logic and API calls live in `useAddApplicationFlow`.
 * All step UI lives in the `add-application-dialog/` sub-components.
 * This component owns only the Dialog shell, the react-hook-form
 * instance, and the wiring between the two.
 *
 * TODO (deferred from v1)
 * =======================
 * - Animated height transition between steps.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { useForm, type SubmitHandler } from "react-hook-form";
import { showSuccess } from "@platform/ui";
import { X } from "lucide-react";
import { useAddApplicationFlow, type AddApplicationFormValues } from "./add-application-dialog/useAddApplicationFlow";
import PasteLinkStep from "./add-application-dialog/PasteLinkStep";
import PasteTextStep from "./add-application-dialog/PasteTextStep";
import ManualEntryStep from "./add-application-dialog/ManualEntryStep";
import ProcessingStep from "./add-application-dialog/ProcessingStep";
import CompanyConfirmStep from "./add-application-dialog/CompanyConfirmStep";

export interface AddApplicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddApplicationDialog({ open, onOpenChange }: AddApplicationDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset: resetForm,
    setValue,
  } = useForm<AddApplicationFormValues>({
    defaultValues: {
      role_title: "",
      location: "",
      remote_type: "unknown",
      notes: "",
    },
  });

  const flow = useAddApplicationFlow({ setValue });

  // -------------------------------------------------------------------------
  // Lifecycle — reset everything on close.
  // -------------------------------------------------------------------------
  function handleOpenChange(next: boolean) {
    if (!next) {
      resetForm();
      flow.reset();
    }
    onOpenChange(next);
  }

  // -------------------------------------------------------------------------
  // Submit.
  // -------------------------------------------------------------------------
  const onSubmit: SubmitHandler<AddApplicationFormValues> = async (values) => {
    await flow.submitApplication(values, () => {
      showSuccess("Application added");
      onOpenChange(false);
    });
  };

  // -------------------------------------------------------------------------
  // Render.
  // -------------------------------------------------------------------------
  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-card border rounded-lg shadow-lg z-50 p-6">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">Add application</Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {flow.state.kind === "input" && flow.state.inputMode === "url" ? (
            <PasteLinkStep
              urlValue={flow.urlValue}
              onUrlChange={flow.handleUrlInputChange}
              onUrlPaste={flow.handleUrlPaste}
              onUrlSubmit={flow.handleUrlSubmit}
              onSetInputMode={flow.setInputMode}
            />
          ) : null}

          {flow.state.kind === "input" && flow.state.inputMode === "text" ? (
            <PasteTextStep
              textValue={flow.textValue}
              onTextChange={flow.setTextValue}
              onTextSubmit={flow.handleTextSubmit}
              onSetInputMode={flow.setInputMode}
            />
          ) : null}

          {flow.state.kind === "input" && flow.state.inputMode === "company-name" ? (
            <ManualEntryStep
              companies={flow.companies}
              companyNameValue={flow.companyNameValue}
              onCompanyNameSelect={flow.handleCompanyNameSelectExisting}
              onCompanyNameCreate={flow.handleCompanyNameCreateOnTheFly}
              onSwitchToUrl={() => flow.setInputMode("url")}
            />
          ) : null}

          {flow.state.kind === "processing" ? (
            <ProcessingStep
              longRunning={flow.state.longRunning}
              sourcePath={flow.state.sourcePath}
            />
          ) : null}

          {flow.state.kind === "review" ? (
            <CompanyConfirmStep
              state={flow.state}
              companies={flow.companies}
              register={register}
              errors={errors}
              creatingApplication={flow.creatingApplication}
              onSubmit={handleSubmit(onSubmit)}
              onPillChangeRequest={flow.handlePillChangeRequest}
              onSelectExisting={flow.handleReviewSelectExisting}
              onCreateOnTheFly={flow.handleReviewCreateOnTheFly}
              onCancelChangingCompany={flow.handleCancelChangingCompany}
              companyNameValue={flow.companyNameValue}
              onCompanyNameChange={flow.setCompanyNameValue}
            />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
