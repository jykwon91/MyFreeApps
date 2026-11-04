import { useGetDocumentsQuery } from "@mybookkeeper/api-client/store/documentsApi";
import { isBeingRead } from "./documentDisplay";
import { useProcessingPoll } from "./useProcessingPoll";

const ALL_DOCUMENTS = {};

/** The list, refreshing itself while anything in it is still being read. */
export function useDocumentsWithPolling() {
  const { data: known } = useGetDocumentsQuery(ALL_DOCUMENTS);
  const poll = useProcessingPoll(known?.some(isBeingRead) ?? false);
  const query = useGetDocumentsQuery(ALL_DOCUMENTS, { pollingInterval: poll.pollingInterval });
  return { ...query, gaveUp: poll.gaveUp };
}
