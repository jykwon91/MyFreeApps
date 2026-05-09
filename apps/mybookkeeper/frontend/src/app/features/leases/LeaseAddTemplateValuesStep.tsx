import { ArrowLeft, Plus } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { PREFILL_PROVENANCE_LABELS } from "@/shared/lib/lease-labels";
import type { SignedLeaseTemplatePrefillItem } from "@/shared/types/lease/signed-lease-template-prefill";

export interface LeaseAddTemplateValuesStepProps {
  items: SignedLeaseTemplatePrefillItem[];
  values: Record<string, string>;
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

function provenanceLabelFor(item: SignedLeaseTemplatePrefillItem): string | null {
  if (item.is_from_existing_values) return "saved on lease";
  if (item.provenance === null) return null;
  return PREFILL_PROVENANCE_LABELS[item.provenance] ?? null;
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
          {items.map((item) => {
            const value = values[item.key] ?? "";
            const provenanceLabel = provenanceLabelFor(item);
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
                  className="px-3 py-2 text-sm border rounded-md bg-background"
                  data-testid={`addendum-input-${item.key}`}
                  placeholder={item.required ? "Required" : "Optional"}
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
