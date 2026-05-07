import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus } from "lucide-react";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Button from "@/shared/components/ui/Button";
import Skeleton from "@/shared/components/ui/Skeleton";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useGetLeaseTemplatesQuery } from "@/shared/store/leaseTemplatesApi";
import { useAddSignedLeaseTemplatesMutation } from "@/shared/store/signedLeasesApi";
import type { LeaseTemplateSummary } from "@/shared/types/lease/lease-template-summary";

export interface LeaseAddTemplateModalProps {
  leaseId: string;
  /** IDs of templates already linked to this lease — excluded from the picker. */
  existingTemplateIds: string[];
  onClose: () => void;
}

/**
 * Modal that lets the host pick additional lease templates to add to an
 * existing generated lease. Only templates NOT already on the lease appear.
 * On confirm, calls POST /signed-leases/{leaseId}/templates and re-fetches
 * the lease detail so attachments and template list refresh.
 */
export default function LeaseAddTemplateModal({
  leaseId,
  existingTemplateIds,
  onClose,
}: LeaseAddTemplateModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addTemplates, { isLoading: isAdding }] =
    useAddSignedLeaseTemplatesMutation();
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

  async function handleConfirm() {
    if (selectedIds.length === 0) return;
    try {
      await addTemplates({ leaseId, templateIds: selectedIds }).unwrap();
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

  return (
    <Dialog.Root open onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg flex flex-col gap-4"
          data-testid="lease-add-template-modal"
        >
          <Dialog.Title className="text-base font-semibold">
            Add template
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground -mt-2">
            Select one or more templates to generate and append to this lease.
          </Dialog.Description>

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
              isLoading={isAdding}
              loadingText="Generating..."
              disabled={selectedIds.length === 0 || isAdding}
              onClick={() => void handleConfirm()}
              data-testid="lease-add-template-confirm"
            >
              <Plus size={14} className="mr-1" />
              Add and generate
            </LoadingButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
