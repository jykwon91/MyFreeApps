import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useGetLeaseTemplatesQuery } from "@/shared/store/leaseTemplatesApi";
import {
  useAddSignedLeaseTemplatesMutation,
  usePrefillAddendumPlaceholdersMutation,
} from "@/shared/store/signedLeasesApi";
import type { LeaseTemplateSummary } from "@/shared/types/lease/lease-template-summary";
import type { SignedLeaseTemplatePrefillItem } from "@/shared/types/lease/signed-lease-template-prefill";
import LeaseAddTemplatePickStep from "./LeaseAddTemplatePickStep";
import LeaseAddTemplateValuesStep from "./LeaseAddTemplateValuesStep";

export interface LeaseAddTemplateModalProps {
  leaseId: string;
  /**
   * IDs of templates already linked to this lease. They still appear in
   * the picker — selecting one is a regenerate, not a duplicate-add.
   */
  existingTemplateIds: string[];
  onClose: () => void;
}

type Step = "pick" | "values";

interface ValuesFormState {
  items: SignedLeaseTemplatePrefillItem[];
  values: Record<string, string>;
}

/**
 * Two-step modal for attaching lease templates to a signed lease and
 * generating their rendered output.
 *
 * Step 1 (``LeaseAddTemplatePickStep``) — pick one or more templates.
 * Already-linked templates are flagged so the host knows they'll regenerate.
 *
 * Step 2 (``LeaseAddTemplateValuesStep``) — fill in placeholder values.
 * The prefill endpoint pre-populates as many as it can from the applicant,
 * lease, linked property, and host user; the host edits the rest.
 *
 * Works for both generated and imported leases. Imported leases use this
 * flow to attach addenda (extension, pet rules, etc.) without touching the
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

  const linkedSet = useMemo(
    () => new Set(existingTemplateIds),
    [existingTemplateIds],
  );
  const available = data?.items ?? [];

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
      prev ? { ...prev, values: { ...prev.values, [key]: value } } : prev,
    );
  }

  async function handleGenerate() {
    if (!valuesState) return;

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

    const anyAlreadyLinked = selectedIds.some((id) => linkedSet.has(id));

    try {
      await addTemplates({
        leaseId,
        templateIds: selectedIds,
        values: valuesState.values,
      }).unwrap();
      const noun =
        selectedIds.length === 1 ? "Document" : `${selectedIds.length} documents`;
      const verb = anyAlreadyLinked ? "regenerated" : "added";
      showSuccess(`${noun} ${verb}.`);
      onClose();
    } catch {
      showError("Couldn't generate the document. Want to try again?");
    }
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
            {step === "pick" ? "Add document" : "Fill in details"}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground -mt-2">
            {step === "pick"
              ? "Pick a template to generate a document — extension, addendum, disclosure, etc."
              : "I've pre-filled what I could. Edit anything that's wrong, and fill in the rest."}
          </Dialog.Description>

          {step === "pick" ? (
            <LeaseAddTemplatePickStep
              available={available}
              linkedSet={linkedSet}
              selectedIds={selectedIds}
              onToggle={handleToggle}
              isError={isError}
              isLoading={isLoading}
              isFetching={isFetching}
              isPrefilling={isPrefilling}
              onRetry={() => void refetch()}
              onContinue={() => void handleContinue()}
              onClose={onClose}
            />
          ) : (
            <LeaseAddTemplateValuesStep
              items={valuesState?.items ?? []}
              values={valuesState?.values ?? {}}
              onValueChange={handleValueChange}
              isAdding={isAdding}
              onBack={() => setStep("pick")}
              onClose={onClose}
              onGenerate={() => void handleGenerate()}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
