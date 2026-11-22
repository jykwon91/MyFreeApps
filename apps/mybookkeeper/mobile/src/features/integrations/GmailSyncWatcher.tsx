import { useGmailSyncWatcher } from "@mybookkeeper/api-client/hooks/useGmailSyncWatcher";
import { useGetIntegrationsQuery } from "@mybookkeeper/api-client/store/integrationsApi";
import { useAppInForeground } from "../../lib/useAppInForeground";
import { gmailConnection, gmailIntegration } from "./gmailConnection";

/**
 * Reloads everything built from emails when Gmail extraction finishes, whichever screen is
 * showing. It re-reads the email queue only while emails are still being fetched or read and the
 * app is on screen; coming back to the app re-reads it once, so work that finished meanwhile shows.
 * With no Gmail linked it reads nothing. Mounted once, inside the signed-in workspace.
 */
export default function GmailSyncWatcher(): null {
  const isForeground = useAppInForeground();
  const { currentData } = useGetIntegrationsQuery();
  const skip = gmailConnection(gmailIntegration(currentData)) === "none";
  useGmailSyncWatcher({ skip, canPoll: isForeground, pollWhileIdle: false });
  return null;
}
