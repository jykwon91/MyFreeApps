import { EMAIL_DERIVED_TAGS } from "@mybookkeeper/api-client/constants/emailDerivedTags";
import { useGetSingleUploadStatusQuery } from "@mybookkeeper/api-client/store/documentsApi";
import { integrationsApi } from "@mybookkeeper/api-client/store/integrationsApi";
import { uploadOutcome } from "@mybookkeeper/api-client/utils/uploadOutcome";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { READ_STATUS_POLL_MS } from "../../constants/capture";
import type { AppDispatch } from "../../lib/store";
import type { UploadFileProgress } from "../../types/UploadFileProgress";
import { uploadDocumentRead } from "./uploadsSlice";

/**
 * Checks on a sent file (not a zip) until it has been read, as the web does, so the phone can say what came of it.
 * Not while the app is in the background, and not at all once it has an answer.
 */
export function useUploadOutcome({ uri, status, documentId }: UploadFileProgress): void {
  const dispatch = useDispatch<AppDispatch>();
  const isReading = status === "reading" && documentId !== null;
  const { currentData } = useGetSingleUploadStatusQuery(documentId ?? "", {
    pollingInterval: READ_STATUS_POLL_MS,
    skipPollingIfUnfocused: true,
    skip: !isReading,
  });
  const outcome = isReading && currentData ? uploadOutcome(currentData.status) : null;

  useEffect(() => {
    if (!outcome) return;
    dispatch(uploadDocumentRead({ uri, outcome }));
    // What it added (or the failure to read it) shows up in the lists, and in the notice about failed documents.
    // integrationsApi is the one that knows every tag extraction feeds, as useRefreshWhenReadingFinishes uses it.
    dispatch(integrationsApi.util.invalidateTags(EMAIL_DERIVED_TAGS));
  }, [dispatch, outcome, uri]);
}
