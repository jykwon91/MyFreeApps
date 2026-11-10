import { useGetSignedLeaseByIdQuery } from "@mybookkeeper/api-client/store/signedLeasesApi";
import { EmptyState } from "@platform/mobile";
import { router } from "expo-router";
import { LEASE_DOCUMENT_MESSAGES as MESSAGES } from "../../constants/leaseDocuments";
import NewLeaseDetailsSkeleton from "../newLease/NewLeaseDetailsSkeleton";
import AddDocumentForm from "./AddDocumentForm";
import { usePrefillDocuments } from "./usePrefillDocuments";

interface AddDocumentPrefilledProps {
  leaseId: string;
  templateIds: readonly string[];
}

/** Asks the server what the chosen documents need, then lets the host fill in the rest. */
export default function AddDocumentPrefilled({ leaseId, templateIds }: AddDocumentPrefilledProps) {
  const { currentData: lease } = useGetSignedLeaseByIdQuery(leaseId);
  // Picking one that is already on the lease makes it again, and the toast says so.
  const isRemake = lease?.templates.some((template) => templateIds.includes(template.id)) ?? false;
  const { state, retry, refresh } = usePrefillDocuments(leaseId, templateIds);

  if (state.status === "loading") return <NewLeaseDetailsSkeleton label={MESSAGES.loadingFields} />;
  if (state.status === "failed") {
    return state.isGone ? (
      <EmptyState action={{ label: MESSAGES.goBack, onPress: () => router.back() }} body={MESSAGES.goneBody} heading={MESSAGES.goneHeading} />
    ) : (
      <EmptyState action={{ label: MESSAGES.tryAgain, onPress: retry }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoadFields} />
    );
  }
  return <AddDocumentForm isRemake={isRemake} items={state.items} leaseId={leaseId} onPrefillStale={refresh} templateIds={templateIds} />;
}
