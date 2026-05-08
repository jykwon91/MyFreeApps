import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, Plus } from "lucide-react";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Button from "@/shared/components/ui/Button";
import Skeleton from "@/shared/components/ui/Skeleton";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useGetLeaseTemplatesQuery } from "@/shared/store/leaseTemplatesApi";
import {
  useAddSignedLeaseTemplatesMutation,
  usePrefillAddendumPlaceholdersMutation,
} from "@/shared/store/signedLeasesApi";
import type { LeaseTemplateSummary } from "@/shared/types/lease/lease-template-summary";
import type { SignedLeaseTemplatePrefillItem } from "@/shared/types/lease/signed-lease-template-prefill";

export interface LeaseAddTemplateModalProps {
  leaseId: string;
  /** IDs of templates already linked to this lease — excluded from the picker. */
  existingTemplateIds: string[];
  onClose: () => void;
}

type Step = "pick" | "values";

interface ValuesFormState {
  items: SignedLeaseTemplatePrefillItem[];
  values: Record<string, string>;
}

/**
 * Two-step modal for adding lease templates to an existing signed lease.
 *
 * Step 1 — pick: host picks one or more templates from a checklist of
 * templates not already linked to the lease.
 *
 * Step 2 — values: backend pre-fills as many placeholders as possible from
 * the parent lease, applicant, linked property, and host user. Host fills in
 * any genuinely-unknown fields (rent, dates, payment method, etc.) and
 * submits. Backend persists merged values to ``lease.values`` and renders
 * the new template files as additional attachments.
 *
 * Works for both generated and imported leases. Imported leases use this
 * flow to attach addenda (e.g. extension addendums) without touching the
 * original signed PDF.
 */
export default function LeaseAddTemplateModal({
  leaseId,
  existingTemplateIds,
  onClose,
}: LeaseAddTemplateModalProps) {
  const [step, setStep] = useState<Step>("pick");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [valuesState, setValuesState] = useState<ValuesFormState | null>(null);

  const [addTemplates, { isLoading: isAdding }] =
    useAddSignedLeaseTemplatesMutation();
  const [prefill, { isLoading: isPrefilling }] =
    usePrefillAddendumPlaceholdersMutation();
  const {
    data,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetLeaseTemplatesQuery();

  const excludeSet = new Set(existingTemplateIds);
  const available = (data?.items ?? []).filter((t) => !excludeSet.has(t.id));

  function handleToggle(t: LeaseTemplateSummary) {
    setSelectedIds((prev) =>
      prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id],
    );
  }

  async function handleContinue() {
    if (selectedIds.length === 0) return;
    try {
      const result = await prefill({
        leaseId,
        templateIds: selectedIds,
      }).unwrap();
      const initialValues: Record<string, string> = {};
      for (const item of result.items) {
        initialValues[item.key] = item.value;
      }
      setValuesState({ items: result.items, values: initialValues });
      setStep("values");
    } catch {
      showError("Couldn't load the template fields. Want to try again?");
    }
  }

  function handleValueChange(key: string, value: string) {
    setValuesState((prev) =>
      prev === null
        ? prev
        : { ...prev, values: { ...prev.values, [key]: value } },
    );
  }

  async function handleGenerate() {
    if (valuesState === null) return;

    const missingRequired = valuesState.items
      .filter((it) => it.required && it.input_type !== "signature")
      .filter((it) => (valuesState.values[it.key] ?? "").trim() === "")
      .map((it) => it.display_label);
    if (missingRequired.length > 0) {
      showError(
        `Please fill in: ${missingRequired.slice(0, 3).join(", ")}${
          missingRequired.length > 3 ? "..." : ""
        }`,
      );
      return;
    }

    try {
      await addTemplates({
        leaseId,
        templateIds: selectedIds,
        values: valuesState.values,
      }).unwrap();
      showSuccess(
        `${selectedIds.length} template${selectedIds.length === 1 ? "" : "s"} added.`,
      );
      onClose();
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 409) {
        showError(
          "Some templates were already on this lease — pick different ones.",
        );
      } else {
        showError("Couldn't add the templates. Want to try again?");
      }
    }
  }

  function inputTypeAttr(t: string): string {
    if (t === "date") return "date";
    if (t === "email") return "email";
    if (t === "phone") return "tel";
    return "text";
  }

  return (
    <Dialog.Root open onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg flex flex-col gap-4 max-h-[90vh] overflow-hidden"
          data-testid="lease-add-template-modal"
        >
          <Dialog.Title className="text-base font-semibold">
            {step === "pick" ? "Add template" : "Fill in details"}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground -mt-2">
            {step === "pick"
              ? "Select one or more templates to generate and append to this lease."
              : "I've pre-filled what I could. Edit anything that's wrong, and fill in the rest."}
          </Dialog.Description>

          {step === "pick" ? (
            <>
              {isError ? (
                <AlertBox
                  variant="error"
                  className="flex items-center justify-between gap-3"
                >
                  <span>I couldn't load your templates. Want me to try again?</span>
                  <LoadingButton
                    variant="secondary"
                    size="sm"
                    isLoading={isFetching}
                    loadingText="Retrying..."
                    onClick={() => refetch()}
                  >
                    Retry
                  </LoadingButton>
                </AlertBox>
              ) : isLoading ? (
                <div className="space-y-2" data-testid="lease-add-template-skeleton">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : available.length === 0 ? (
                <p
                  className="text-sm text-muted-foreground py-4 text-center"
                  data-testid="lease-add-template-empty"
                >
                  All your templates are already on this lease.
                </p>
              ) : (
                <ul
                  className="space-y-2 max-h-72 overflow-y-auto"
                  data-testid="lease-add-template-list"
                >
                  {available.map((t) => {
                    const checked = selectedIds.includes(t.id);
                    return (
                      <li key={t.id}>
                        <label
                          className={[
                            "w-full flex items-start gap-3 border rounded-lg px-4 py-3 transition-colors min-h-[44px] cursor-pointer",
                            checked
                              ? "border-primary bg-primary/5"
                              : "hover:bg-muted/50",
                          ].join(" ")}
                          data-testid={`add-template-option-${t.id}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggle(t)}
                            className="mt-1 h-4 w-4 cursor-pointer"
                            aria-label={`Select template ${t.name}`}
                            data-testid={`add-template-checkbox-${t.id}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="font-medium text-sm">{t.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                v{t.version}
                              </span>
                            </div>
                            {t.description ? (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                {t.description}
                              </p>
                            ) : null}
                            <p className="text-xs text-muted-foreground mt-1">
                              {t.placeholder_count}{" "}
                              {t.placeholder_count === 1
                                ? "placeholder"
                                : "placeholders"}
                            </p>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <LoadingButton
                  isLoading={isPrefilling}
                  loadingText="Loading fields..."
                  disabled={selectedIds.length === 0 || isPrefilling}
                  onClick={() => void handleContinue()}
                  data-testid="lease-add-template-continue"
                >
                  Continue
                </LoadingButton>
              </div>
            </>
          ) : (
            <>
              {valuesState !== null && valuesState.items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  This template has nothing for you to fill in — everything is
                  auto-handled. Click Generate to render it.
                </p>
              ) : (
                <ul
                  className="space-y-3 max-h-[60vh] overflow-y-auto pr-1"
                  data-testid="lease-add-template-values-list"
                >
                  {(valuesState?.items ?? []).map((item) => {
                    const value = valuesState?.values[item.key] ?? "";
                    const provenance = item.provenance;
                    const provenanceLabel =
                      provenance === "applicant"
                        ? "from applicant"
                        : provenance === "lease"
                          ? "from lease"
                          : provenance === "property"
                            ? "from property"
                            : provenance === "user"
                              ? "from your profile"
                              : provenance === "today"
                                ? "today's date"
                                : provenance === "lease.values"
                                  ? "saved on lease"
                                  : null;
                    return (
                      <li key={item.key} className="flex flex-col gap-1">
                        <label
                          htmlFor={`addendum-input-${item.key}`}
                          className="text-xs font-medium flex items-center gap-2 flex-wrap"
                        >
                          {item.display_label}
                          {item.required ? (
                            <span className="text-destructive" aria-hidden>
                              *
                            </span>
                          ) : null}
                          {provenanceLabel !== null ? (
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-normal">
                              {provenanceLabel}
                            </span>
                          ) : null}
                        </label>
                        <input
                          id={`addendum-input-${item.key}`}
                          type={inputTypeAttr(item.input_type)}
                          value={value}
                          onChange={(e) =>
                            handleValueChange(item.key, e.target.value)
                          }
                          className="px-3 py-2 text-sm border rounded-md bg-background"
                          data-testid={`addendum-input-${item.key}`}
                          placeholder={
                            item.required ? "Required" : "Optional"
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="flex items-center justify-between gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("pick")}
                  data-testid="lease-add-template-back"
                >
                  <ArrowLeft size={14} className="mr-1" />
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={onClose}>
                    Cancel
                  </Button>
                  <LoadingButton
                    isLoading={isAdding}
                    loadingText="Generating..."
                    disabled={isAdding}
                    onClick={() => void handleGenerate()}
                    data-testid="lease-add-template-confirm"
                  >
                    <Plus size={14} className="mr-1" />
                    Generate
                  </LoadingButton>
                </div>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
