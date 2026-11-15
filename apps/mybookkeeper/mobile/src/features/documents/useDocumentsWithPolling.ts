import { EMAIL_DERIVED_TAGS } from "@mybookkeeper/api-client/constants/emailDerivedTags";
import { useGetDocumentsQuery } from "@mybookkeeper/api-client/store/documentsApi";
import { integrationsApi } from "@mybookkeeper/api-client/store/integrationsApi";
import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { ALL_DOCUMENTS } from "../../constants/documents";
import type { AppDispatch } from "../../lib/store";
import { isBeingRead } from "./documentDisplay";
import { useProcessingPoll } from "./useProcessingPoll";

/**
 * The list, refreshing itself while anything in it is still being read. A document
 * that finishes has just changed everything derived from extraction (see
 * EMAIL_DERIVED_TAGS), so all of it is refreshed.
 */
export function useDocumentsWithPolling() {
  const dispatch = useDispatch<AppDispatch>();
  const { data: known } = useGetDocumentsQuery(ALL_DOCUMENTS);
  const beingRead = known?.filter(isBeingRead).length ?? 0;
  const poll = useProcessingPoll(beingRead > 0);
  const query = useGetDocumentsQuery(ALL_DOCUMENTS, { pollingInterval: poll.pollingInterval });

  const lastBeingRead = useRef(beingRead);
  useEffect(() => {
    if (beingRead < lastBeingRead.current) {
      dispatch(integrationsApi.util.invalidateTags(EMAIL_DERIVED_TAGS));
    }
    lastBeingRead.current = beingRead;
  }, [beingRead, dispatch]);

  return { ...query, gaveUp: poll.gaveUp };
}
