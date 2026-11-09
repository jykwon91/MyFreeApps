import { EmptyState } from "@platform/mobile";
import { LEASE_DOCUMENT_MESSAGES as MESSAGES } from "../../constants/leaseDocuments";
import { useCanWrite } from "../workspace/useCanWrite";
import AddDocumentPrefilled from "./AddDocumentPrefilled";

interface AddDocumentValuesScreenProps {
  leaseId: string;
  templateIds: readonly string[];
}

/** The fill-in step. Someone who can only read gets nothing, and the server is never asked what to fill. */
export default function AddDocumentValuesScreen({ leaseId, templateIds }: AddDocumentValuesScreenProps) {
  if (!useCanWrite()) return <EmptyState body={MESSAGES.viewOnly} heading={MESSAGES.pickTitle} />;
  return <AddDocumentPrefilled leaseId={leaseId} templateIds={templateIds} />;
}
