import DocumentDraftNotices from "@/app/features/documents/DocumentDraftNotices";
import type { UtilityPlanDraft } from "@/shared/types/utility/utility-plan-draft";

export interface UtilityPlanDraftNoticesProps {
  draft: UtilityPlanDraft;
}

/** The utility form's reading of ``DocumentDraftNotices``. */
export default function UtilityPlanDraftNotices({ draft }: UtilityPlanDraftNoticesProps) {
  return (
    <DocumentDraftNotices
      draft={draft}
      notes={draft.notes}
      testIdPrefix="utility-plan"
    />
  );
}
