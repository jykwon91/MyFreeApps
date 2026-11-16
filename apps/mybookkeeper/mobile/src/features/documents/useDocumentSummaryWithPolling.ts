import { useGetDocumentSummaryQuery } from "@mybookkeeper/api-client/store/documentsApi";
import { useProcessingPoll } from "./useProcessingPoll";
import { useRefreshWhenReadingFinishes } from "./useRefreshWhenReadingFinishes";

/** The document counts, refreshing themselves while anything is still being read. Polls the counts, never the list. */
export function useDocumentSummaryWithPolling() {
  const { data: known } = useGetDocumentSummaryQuery();
  const beingRead = known?.in_progress ?? 0;
  const poll = useProcessingPoll(beingRead > 0);
  const query = useGetDocumentSummaryQuery(undefined, { pollingInterval: poll.pollingInterval, skipPollingIfUnfocused: true });
  useRefreshWhenReadingFinishes(beingRead);
  return query;
}
