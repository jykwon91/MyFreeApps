import DocumentDraftNotices from "@/app/features/documents/DocumentDraftNotices";
import type { InsurancePolicyDraft } from "@/shared/types/insurance/insurance-policy-draft";

export interface InsurancePolicyDraftNoticesProps {
  draft: InsurancePolicyDraft;
}

/** The policy form's reading of ``DocumentDraftNotices``. */
export default function InsurancePolicyDraftNotices({
  draft,
}: InsurancePolicyDraftNoticesProps) {
  return (
    <DocumentDraftNotices
      draft={draft}
      notes={draft.notes}
      testIdPrefix="insurance-policy"
    />
  );
}
