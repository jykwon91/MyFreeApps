import DocumentDraftNotices from "@/app/features/documents/DocumentDraftNotices";
import type { MortgageDraft } from "@mybookkeeper/api-client/types/mortgage/mortgage-draft";

export interface MortgageDraftNoticesProps {
  draft: MortgageDraft;
}

/** The mortgage form's reading of ``DocumentDraftNotices``. */
export default function MortgageDraftNotices({
  draft,
}: MortgageDraftNoticesProps) {
  return (
    <DocumentDraftNotices draft={draft} notes={draft.notes} testIdPrefix="mortgage" />
  );
}
