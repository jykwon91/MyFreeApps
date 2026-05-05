import { useState } from "react";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useUpdateInquiryMutation } from "@/shared/store/inquiriesApi";
import { INQUIRY_STAGES, INQUIRY_STAGE_LABELS } from "@/shared/lib/inquiry-labels";
import type { InquiryStage } from "@/shared/types/inquiry/inquiry-stage";

export interface InquiryStageDropdownProps {
  inquiryId: string;
  currentStage: InquiryStage;
}

/**
 * Stage transition dropdown for the inquiry detail page.
 *
 * Patches the inquiry on change with a single ``PATCH /inquiries/{id}`` and
 * surfaces a toast for both success and error. RTK Query invalidates the
 * inquiry tag + the list tag (see ``inquiriesApi``) so the inbox reflects
 * the change without a refetch dance.
 */
export default function InquiryStageDropdown({ inquiryId, currentStage }: InquiryStageDropdownProps) {
  const [updateInquiry] = useUpdateInquiryMutation();
  const [pending, setPending] = useState<InquiryStage | null>(null);

  async function handleChange(next: InquiryStage) {
    if (next === currentStage) return;
    setPending(next);
    try {
      await updateInquiry({ id: inquiryId, data: { stage: next } }).unwrap();
      showSuccess(`Moved to ${INQUIRY_STAGE_LABELS[next]}.`);
    } catch {
      showError("I couldn't update that stage. Want to try again?");
    } finally {
      setPending(null);
    }
  }

  // Display the pending stage optimistically so the user sees immediate
  // feedback per ``feedback_ux``.
  const display = pending ?? currentStage;

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Move to:</span>
      <select
        data-testid="inquiry-stage-dropdown"
        value={display}
        onChange={(e) => void handleChange(e.target.value as InquiryStage)}
        disabled={pending !== null}
        className="border rounded-md px-3 py-2 text-sm min-h-[44px]"
      >
        {INQUIRY_STAGES.map((s) => (
          <option key={s} value={s}>
            {INQUIRY_STAGE_LABELS[s]}
          </option>
        ))}
      </select>
    </label>
  );
}
