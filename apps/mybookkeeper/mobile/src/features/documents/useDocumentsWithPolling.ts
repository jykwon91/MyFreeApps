import { useGetDocumentsQuery } from "@mybookkeeper/api-client/store/documentsApi";
import { ALL_DOCUMENTS } from "../../constants/documents";
import { isBeingRead } from "./documentDisplay";
import { useProcessingPoll } from "./useProcessingPoll";
import { useRefreshWhenReadingFinishes } from "./useRefreshWhenReadingFinishes";

/** The list, refreshing itself while anything in it is still being read. */
export function useDocumentsWithPolling() {
  const { data: known } = useGetDocumentsQuery(ALL_DOCUMENTS);
  const beingRead = known?.filter(isBeingRead).length ?? 0;
  const poll = useProcessingPoll(beingRead > 0);
  const query = useGetDocumentsQuery(ALL_DOCUMENTS, { pollingInterval: poll.pollingInterval, skipPollingIfUnfocused: true });
  useRefreshWhenReadingFinishes(beingRead);
  return { ...query, gaveUp: poll.gaveUp };
}
