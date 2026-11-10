import { LEASE_DOCUMENT_MESSAGES as MESSAGES } from "../../constants/leaseDocuments";
import LeaseTemplatesSkeleton from "../leaseTemplates/LeaseTemplatesSkeleton";
import RequireWrite from "../workspace/RequireWrite";
import AddDocumentPickList from "./AddDocumentPickList";

/** Which of the host's templates to make documents from, for a lease that already exists. A viewer is told they can't, and nothing is fetched for them. */
export default function AddDocumentPickScreen({ leaseId }: { leaseId: string }) {
  return (
    <RequireWrite body={MESSAGES.viewOnly} heading={MESSAGES.pickTitle} loading={<LeaseTemplatesSkeleton />}>
      <AddDocumentPickList leaseId={leaseId} />
    </RequireWrite>
  );
}
