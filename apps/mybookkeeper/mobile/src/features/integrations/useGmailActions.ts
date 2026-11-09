import {
  useCancelGmailSyncMutation,
  useDisconnectGmailMutation,
  useExtractAllMutation,
  useRetryAllFailedMutation,
  useSyncGmailMutation,
} from "@mybookkeeper/api-client/store/integrationsApi";
import { useToast } from "@platform/mobile";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../../constants/integrations";
import { useWrite } from "../../lib/useWrite";
import { actionFailureCopy } from "../../lib/writeFailureCopy";
import type { IntegrationActions } from "../../types/IntegrationActions";
import { runIntegrationWrite } from "./runIntegrationWrite";

const SYNC_COPY = actionFailureCopy("start the sync", {
  invalid: "I couldn't find the Gmail label you're filtering by. Change or clear it, then try again.",
  other: "I couldn't start the sync. If Gmail needs reconnecting, that's done from the website. Want to try again?",
});
const CANCEL_COPY = actionFailureCopy("cancel the sync");
const DISCONNECT_COPY = actionFailureCopy("disconnect Gmail", { gone: "Gmail was already disconnected. Pull down to refresh." });
const EXTRACT_COPY = actionFailureCopy("start reading those emails");
const RETRY_ALL_COPY = actionFailureCopy("retry the failed items");

/** Everything the Gmail card can ask the server to do, each with its own busy state and outcome toast. */
export function useGmailActions(): IntegrationActions {
  const { showToast } = useToast();
  const [syncGmail] = useSyncGmailMutation();
  const [cancelGmailSync] = useCancelGmailSyncMutation();
  const [disconnectGmail] = useDisconnectGmailMutation();
  const [extractAll] = useExtractAllMutation();
  const [retryAllFailed] = useRetryAllFailedMutation();
  const sync = useWrite();
  const cancel = useWrite();
  const disconnect = useWrite();
  const extract = useWrite();
  const retryAll = useWrite();

  return {
    sync: {
      isBusy: sync.isBusy,
      run: () => runIntegrationWrite(sync, showToast, SYNC_COPY, () => syncGmail().unwrap(), () => MESSAGES.syncStarted),
    },
    cancel: {
      isBusy: cancel.isBusy,
      run: (syncLogId) =>
        runIntegrationWrite(cancel, showToast, CANCEL_COPY, () => cancelGmailSync(syncLogId === undefined ? undefined : { sync_log_id: syncLogId }).unwrap(), () => MESSAGES.cancelled),
    },
    disconnect: {
      isBusy: disconnect.isBusy,
      run: () => runIntegrationWrite(disconnect, showToast, DISCONNECT_COPY, () => disconnectGmail().unwrap(), () => MESSAGES.disconnected),
    },
    extractAll: {
      isBusy: extract.isBusy,
      run: () => {
        let count = 0;
        return runIntegrationWrite(
          extract,
          showToast,
          EXTRACT_COPY,
          async () => {
            count = (await extractAll().unwrap()).count;
          },
          () => MESSAGES.extracting(count),
        );
      },
    },
    retryAll: {
      isBusy: retryAll.isBusy,
      run: () => runIntegrationWrite(retryAll, showToast, RETRY_ALL_COPY, () => retryAllFailed().unwrap(), () => MESSAGES.retriedAll),
    },
  };
}
