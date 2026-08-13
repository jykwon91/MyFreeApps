import DocumentDraftNotices from "@/app/features/documents/DocumentDraftNotices";
import { draftFieldsTheFormCannotHold } from "@/shared/lib/utility-plan-draft";
import type { UtilityPlanDraft } from "@/shared/types/utility/utility-plan-draft";

export interface UtilityPlanDraftNoticesProps {
  draft: UtilityPlanDraft;
}

/** The utility form's reading of ``DocumentDraftNotices``. */
export default function UtilityPlanDraftNotices({ draft }: UtilityPlanDraftNoticesProps) {
  return (
    <DocumentDraftNotices
      draft={draft}
      unheld={draftFieldsTheFormCannotHold(draft)}
      unrepresentedLabel="a plan record"
      testIdPrefix="utility-plan"
    />
  );
}
