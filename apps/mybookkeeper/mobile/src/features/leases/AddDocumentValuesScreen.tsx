import { LEASE_DOCUMENT_MESSAGES as MESSAGES } from "../../constants/leaseDocuments";
import type { AddDocumentValuesScreenProps } from "../../types/AddDocumentValuesScreenProps";
import RequireWrite from "../workspace/RequireWrite";
import NewLeaseDetailsSkeleton from "../newLease/NewLeaseDetailsSkeleton";
import AddDocumentPrefilled from "./AddDocumentPrefilled";

/** The fill-in step. Someone who can only read gets nothing, and the server is never asked what to fill. */
export default function AddDocumentValuesScreen({ leaseId, templateIds }: AddDocumentValuesScreenProps) {
  return (
    <RequireWrite loading={<NewLeaseDetailsSkeleton label={MESSAGES.loadingFields} />} body={MESSAGES.viewOnly} heading={MESSAGES.pickTitle}>
      <AddDocumentPrefilled leaseId={leaseId} templateIds={templateIds} />
    </RequireWrite>
  );
}
