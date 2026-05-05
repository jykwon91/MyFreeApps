import { useRef, useState } from "react";
import { Lock } from "lucide-react";
import { useToast } from "@/shared/hooks/useToast";
import { useUpdateApplicantContractDatesMutation } from "@/shared/store/applicantsApi";
import type { ApplicantStage } from "@/shared/types/applicant/applicant-stage";

const DEBOUNCE_MS = 600;
const LOCKED_STAGE: ApplicantStage = "lease_signed";

export interface ContractDatesEditorProps {
  applicantId: string;
  field: "contract_start" | "contract_end";
  value: string | null;
  stage: ApplicantStage;
  label: string;
}

/**
 * Inline-editable date input for a single contract date field.
 *
 * When ``stage === 'lease_signed'``, renders the date as read-only text
 * with a lock icon and a tooltip explaining why editing is disabled.
 *
 * Save-on-blur with 600ms debounce: if the user blurs and the value changed,
 * PATCH /applicants/{id} is called.
 *
 * State synchronization: the parent must pass a ``key`` prop based on the
 * applicant's ``updated_at`` so this component remounts after each successful
 * save (the RTK Query cache invalidation causes ``updated_at`` to change,
 * which resets the controlled input value automatically).
 *
 * Per the one-component-per-file rule this component handles a single field.
 * The detail page renders two of these side-by-side.
 */
export default function ContractDatesEditor({
  applicantId,
  field,
  value,
  stage,
  label,
}: ContractDatesEditorProps) {
  const { showError, showSuccess } = useToast();
  const [updateDates, { isLoading }] = useUpdateApplicantContractDatesMutation();

  // Local editing state — HTML date inputs expect "YYYY-MM-DD" strings.
  const [localValue, setLocalValue] = useState(value ?? "");
  const lastSavedRef = useRef(value ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLocked = stage === LOCKED_STAGE;

  async function save(newValue: string) {
    if (newValue === lastSavedRef.current) return;
    try {
      await updateDates({
        applicantId,
        data: { [field]: newValue || null },
      }).unwrap();
      lastSavedRef.current = newValue;
      showSuccess("Contract date updated");
    } catch (err: unknown) {
      const detail =
        err && typeof err === "object" && "data" in err
          ? (err as { data?: { detail?: { message?: string } | string } }).data?.detail
          : undefined;
      const message =
        detail && typeof detail === "object" && "message" in detail
          ? detail.message
          : typeof detail === "string"
            ? detail
            : "Failed to update contract date. Please try again.";
      showError(message ?? "Failed to update contract date. Please try again.");
      // Revert local state on failure.
      setLocalValue(lastSavedRef.current);
    }
  }

  function handleBlur() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void save(localValue);
    }, DEBOUNCE_MS);
  }

  if (isLocked) {
    return (
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd
          className="flex items-center gap-1 text-sm"
          data-testid={`contract-dates-locked-${field}`}
        >
          <span>{localValue || "—"}</span>
          <span
            title="Locked — lease has been signed. Update on the lease if needed."
            aria-label="Locked — lease has been signed"
            data-testid={`contract-dates-lock-icon-${field}`}
            className="text-muted-foreground"
          >
            <Lock className="h-3 w-3" aria-hidden="true" />
          </span>
        </dd>
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={`contract-date-${field}-${applicantId}`}
        className="text-xs text-muted-foreground block"
      >
        {label}
      </label>
      <input
        id={`contract-date-${field}-${applicantId}`}
        type="date"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        disabled={isLoading}
        data-testid={`contract-date-input-${field}`}
        className="mt-0.5 rounded border bg-background px-2 py-1 text-sm min-h-[44px] w-full disabled:opacity-50"
        aria-label={label}
      />
    </div>
  );
}
