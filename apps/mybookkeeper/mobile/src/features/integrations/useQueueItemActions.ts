import { useDismissQueueItemMutation, useRetryQueueItemMutation } from "@mybookkeeper/api-client/store/integrationsApi";
import { useToast } from "@platform/mobile";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../../constants/integrations";
import { useWrite } from "../../lib/useWrite";
import { actionFailureCopy } from "../../lib/writeFailureCopy";
import type { QueueItemActions } from "../../types/QueueItemActions";
import { runIntegrationWrite } from "./runIntegrationWrite";

const RETRY_COPY = actionFailureCopy("retry that email", { gone: "That email is no longer in the queue. Pull down to refresh." });
const DISMISS_COPY = actionFailureCopy("dismiss that email", { gone: "That email was already dismissed. Pull down to refresh." });

export function useQueueItemActions(itemId: string): QueueItemActions {
  const { showToast } = useToast();
  const [retryItem] = useRetryQueueItemMutation();
  const [dismissItem] = useDismissQueueItemMutation();
  const retry = useWrite();
  const dismiss = useWrite();

  return {
    retry: { isBusy: retry.isBusy, run: () => runIntegrationWrite(retry, showToast, RETRY_COPY, () => retryItem(itemId).unwrap(), () => MESSAGES.itemRetried) },
    dismiss: { isBusy: dismiss.isBusy, run: () => runIntegrationWrite(dismiss, showToast, DISMISS_COPY, () => dismissItem(itemId).unwrap(), () => MESSAGES.dismissed) },
  };
}
