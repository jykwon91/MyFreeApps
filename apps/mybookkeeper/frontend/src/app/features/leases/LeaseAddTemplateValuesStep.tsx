import { ArrowLeft, Plus } from "lucide-react";
import { Button, FieldFeedback, fieldFeedbackAria, LoadingButton } from "@platform/ui";
import { LEASE_VALUE_READ_ONLY_NOTE } from "@mybookkeeper/api-client/constants/leaseDocumentsLocked";
import { prefillProvenanceLabel } from "@mybookkeeper/api-client/utils/leasePrefill";
import type { LeasePrefillProblem } from "@mybookkeeper/api-client/types/lease/lease-prefill-problem";
import { LEASE_PREFILL_PROBLEM_MESSAGES } from "@/shared/lib/lease-labels";
import type { SignedLeaseTemplatePrefillItem } from "@mybookkeeper/api-client/types/lease/signed-lease-template-prefill";

export interface LeaseAddTemplateValuesStepProps {
  items: SignedLeaseTemplatePrefillItem[];
  values: Record<string, string>;
  problems: Record<string, LeasePrefillProblem>;
  onValueChange: (key: string, value: string) => void;
  isAdding: boolean;
  onBack: () => void;
  onClose: () => void;
  onGenerate: () => void;
}

function inputTypeAttr(t: string): string {
  if (t === "date") return "date";
  if (t === "email") return "email";
  if (t === "phone") return "tel";
  return "text";
}

/**
 * Step 2 of the Add Document modal: fill in placeholder values. Items are
 * pre-populated by the prefill endpoint where possible (applicant /
 * lease / property / user / today). The host edits anything wrong and
 * fills the rest. Required fields show an asterisk; the parent modal
 * blocks submit when any required field is blank.
 */
export default function LeaseAddTemplateValuesStep({
  items,
  values,
  problems,
  onValueChange,
  isAdding,
  onBack,
  onClose,
  onGenerate,
}: LeaseAddTemplateValuesStepProps) {
  return (
    <>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          This template has nothing for you to fill in — everything is
          auto-handled. Click Generate to render it.
        </p>
      ) : (
        <ul
          className="space-y-3 max-h-[60vh] overflow-y-auto pr-1"
          data-testid="lease-add-template-values-list"
        >
          {items.map((item, index) => {
            const value = values[item.key] ?? "";
            const provenanceLabel = prefillProvenanceLabel(item);
            const problem = problems[item.key];
            // Keys can hold spaces ("NEW LEASE END DATE"), which can't sit in an aria-describedby list,
            // so the notes under the input are named by position.
            const readOnlyNoteId = `addendum-${index}-readonly`;
            const feedback = {
              id: `addendum-${index}`,
              error: problem && LEASE_PREFILL_PROBLEM_MESSAGES[problem],
              testId: `addendum-error-${item.key}`,
            };
            const describedBy = [
              item.is_read_only ? readOnlyNoteId : null,
              fieldFeedbackAria(feedback)["aria-describedby"],
            ].filter(Boolean).join(" ");
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
                  {provenanceLabel ? (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-normal">
                      {provenanceLabel}
                    </span>
                  ) : null}
                </label>
                <input
                  id={`addendum-input-${item.key}`}
                  type={inputTypeAttr(item.input_type)}
                  value={value}
                  onChange={(e) => onValueChange(item.key, e.target.value)}
                  className="px-3 py-2 text-sm border rounded-md bg-background read-only:bg-muted read-only:text-muted-foreground"
                  data-testid={`addendum-input-${item.key}`}
                  placeholder={item.required ? "Required" : "Optional"}
                  aria-invalid={problem ? true : undefined}
                  readOnly={item.is_read_only}
                  aria-describedby={describedBy || undefined}
                />
                {item.is_read_only ? (
                  <p
                    id={readOnlyNoteId}
                    className="text-xs text-muted-foreground"
                    data-testid={`addendum-readonly-${item.key}`}
                  >
                    {LEASE_VALUE_READ_ONLY_NOTE}
                  </p>
                ) : null}
                <FieldFeedback {...feedback} />
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
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
            onClick={onGenerate}
            data-testid="lease-add-template-confirm"
          >
            <Plus size={14} className="mr-1" />
            Generate
          </LoadingButton>
        </div>
      </div>
    </>
  );
}
