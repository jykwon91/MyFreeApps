import { integrationsApi, useGetEmailQueueQuery, useGetIntegrationsQuery, useGetSyncLogsQuery } from "@mybookkeeper/api-client/store/integrationsApi";
import { syncPollInterval } from "@mybookkeeper/api-client/utils/syncPollInterval";
import { useEffect, useRef } from "react";
import { useScreenFocused } from "@platform/mobile";
import type { IntegrationsData } from "../../types/IntegrationsData";
import { gmailConnection, gmailIntegration } from "./gmailConnection";

/**
 * The integrations, sync history and email queue, kept fresh while this screen is showing.
 * Gmail sync runs on the server, so the history and queue are re-read every few seconds while
 * a sync or extraction is in flight, only occasionally when nothing is, and not at all when the
 * screen is hidden. When a sync finishes, Gmail's own status ("last synced", sign-in expired) is
 * re-read. Reloading what extraction produced is GmailSyncWatcher's job, so it happens on any screen.
 */
export function useIntegrationsData(): IntegrationsData {
  const isFocused = useScreenFocused();
  const integrations = useGetIntegrationsQuery();
  const gmail = gmailIntegration(integrations.currentData);
  const connection = gmailConnection(gmail);
  const skip = connection === "none";
  // The rate has to be known before subscribing, so it comes from what is already cached.
  const cachedLogs = integrationsApi.endpoints.getSyncLogs.useQueryState(undefined, { skip });
  const cachedQueue = integrationsApi.endpoints.getEmailQueue.useQueryState(undefined, { skip });
  const pollingInterval = isFocused && !skip ? syncPollInterval(cachedLogs.data, cachedQueue.data) : 0;
  const logs = useGetSyncLogsQuery(undefined, { skip, pollingInterval, skipPollingIfUnfocused: true });
  const queue = useGetEmailQueueQuery(undefined, { skip, pollingInterval, skipPollingIfUnfocused: true });
  const isSyncing = logs.currentData?.[0]?.status === "running";
  const wasSyncing = useRef(false);
  const { refetch: refetchIntegrations } = integrations;

  useEffect(() => {
    if (wasSyncing.current && !isSyncing) void refetchIntegrations();
    wasSyncing.current = isSyncing;
  }, [isSyncing, refetchIntegrations]);

  async function refresh(): Promise<void> {
    await Promise.all([integrations.refetch(), ...(skip ? [] : [logs.refetch(), queue.refetch()])]);
  }

  return { integrations, gmail, connection, logs, queue, refresh };
}
