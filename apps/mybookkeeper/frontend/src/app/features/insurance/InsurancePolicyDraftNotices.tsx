import DocumentDraftNotices from "@/app/features/documents/DocumentDraftNotices";
import { draftFieldsTheFormCannotHold } from "@/shared/lib/insurance-policy-draft";
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
      unheld={draftFieldsTheFormCannotHold(draft)}
      unrepresentedLabel="a policy record"
      testIdPrefix="insurance-policy"
    />
  );
}
