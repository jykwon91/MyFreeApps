import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  useGetIntegrationsQuery,
  useConnectGmailMutation,
  useDisconnectGmailMutation,
  useSyncGmailMutation,
  useGetSyncLogsQuery,
  useCancelGmailSyncMutation,
  useGetEmailQueueQuery,
  useExtractAllMutation,
  useDismissQueueItemMutation,
  useRetryQueueItemMutation,
  useRetryAllFailedMutation,
  useUpdateGmailLabelMutation,
} from "@/shared/store/integrationsApi";
import type { EmailQueueItem } from "@/shared/types/integration/email-queue";
import { POLLING_OPTIONS, EMPTY_QUEUE } from "@/shared/lib/constants";
import { timeAgo } from "@/shared/utils/date";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import { groupBySession } from "@/shared/utils/email-queue";
import { useToast } from "@/shared/hooks/useToast";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import { useInvalidateOnExtractionComplete } from "@/shared/hooks/useInvalidateOnExtractionComplete";
import IntegrationsSkeleton from "@/app/features/integrations/IntegrationsSkeleton";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import SyncLogRow from "@/app/features/integrations/SyncLogRow";
import { useDismissable } from "@/shared/hooks/useDismissable";

export default function Integrations() {
  const canWrite = useCanWrite();
  const { dismissed: infoDismissed, dismiss: dismissInfo } = useDismissable("integrations-info-dismissed");
  const { data: integrations = [], isLoading, refetch } = useGetIntegrationsQuery();
  const gmail = integrations.find((i) => i.provider === "gmail");
  const { showError, showSuccess } = useToast();

  const [connectGmail, { isLoading: isConnecting }] = useConnectGmailMutation();
  const [disconnectGmail, { isLoading: isDisconnecting }] = useDisconnectGmailMutation();
  const [syncGmail, { isLoading: isSyncStarting }] = useSyncGmailMutation();
  const [cancelGmailSync, { isLoading: isCancelling }] = useCancelGmailSyncMutation();
  const [updateGmailLabel, { isLoading: isSavingLabel }] = useUpdateGmailLabelMutation();

  const { data: syncLogs = [] } = useGetSyncLogsQuery(undefined, POLLING_OPTIONS);
  const { data: queue = EMPTY_QUEUE } = useGetEmailQueueQuery(undefined, POLLING_OPTIONS);

  // Invalidate Summary/Transaction/Document caches when any queue item finishes extracting
  // so downstream views (Dashboard charts, Transactions list) pick up newly-extracted data.
  useInvalidateOnExtractionComplete(queue);

  const [extractAll] = useExtractAllMutation();
  const [dismissItem] = useDismissQueueItemMutation();
  const [retryItem] = useRetryQueueItemMutation();
  const [retryAllFailed, { isLoading: isRetrying }] = useRetryAllFailedMutation();

  const latestLog = syncLogs[0] ?? null;
  const isSyncing = latestLog?.status === "running";

  const savedLabel = (gmail?.metadata as Record<string, unknown> | null)?.gmail_label;
  // Track user edits as an override; fall back to the server value before any edit.
  const [labelOverride, setLabelOverride] = useState<string | null>(null);
  const labelInput = labelOverride ?? (typeof savedLabel === "string" ? savedLabel : "");

  function setLabelInput(value: string) {
    setLabelOverride(value);
  }

  const queueBySession = useMemo(() => {
    const map = new Map<number, EmailQueueItem[]>();
    for (const group of groupBySession(queue)) {
      map.set(group.syncLogId, group.items);
    }
    return map;
  }, [queue]);

  const fetchedCount = useMemo(() => queue.filter((i) => i.status === "fetched").length, [queue]);
  const extractingCount = useMemo(() => queue.filter((i) => i.status === "extracting").length, [queue]);
  const failedCount = useMemo(() => queue.filter((i) => i.status === "failed").length, [queue]);
  const isExtracting = extractingCount > 0;

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if ((event.data as { type?: string })?.type === "gmail_connected") refetch();
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [refetch]);

  const handleConnect = useCallback(() => {
    connectGmail()
      .unwrap()
      .then((data) => {
        window.open(data.auth_url, "gmail-oauth", "width=520,height=650,left=400,top=100");
      })
      .catch((err) => showError(`Connect failed: ${extractErrorMessage(err)}`));
  }, [connectGmail, showError]);

  const [confirmSync, setConfirmSync] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const handleSync = useCallback(() => {
    setConfirmSync(false);
    syncGmail()
      .unwrap()
      .catch((err) => showError(`Sync failed: ${extractErrorMessage(err)}`));
  }, [syncGmail, showError]);

  const handleDisconnect = useCallback(() => {
    setConfirmDisconnect(false);
    disconnectGmail()
      .unwrap()
      .then(() => showSuccess("Disconnected from Gmail. You can reconnect anytime."))
      .catch((err) => showError(`Couldn't disconnect: ${extractErrorMessage(err)}`));
  }, [disconnectGmail, showSuccess, showError]);

  const handleCancel = useCallback(
    (syncLogId?: number) => {
      const payload = syncLogId != null ? { sync_log_id: syncLogId } : undefined;
      cancelGmailSync(payload)
        .unwrap()
        .catch((err) => showError(`Cancel failed: ${extractErrorMessage(err)}`));
    },
    [cancelGmailSync, showError],
  );

  const handleExtractAll = useCallback(() => {
    extractAll()
      .unwrap()
      .then((res) => showSuccess(`Extracting ${res.count} items...`))
      .catch((err) => showError(`Extract failed: ${extractErrorMessage(err)}`));
  }, [extractAll, showError, showSuccess]);

  const handleRetryAll = useCallback(() => {
    retryAllFailed()
      .unwrap()
      .catch((err) => showError(`Retry failed: ${extractErrorMessage(err)}`));
  }, [retryAllFailed, showError]);

  const handleRetryItem = useCallback(
    (id: string) => {
      retryItem(id)
        .unwrap()
        .catch((err) => showError(`Retry failed: ${extractErrorMessage(err)}`));
    },
    [retryItem, showError],
  );

  const handleDismissItem = useCallback(
    (id: string) => {
      dismissItem(id)
        .unwrap()
        .catch((err) => showError(`Dismiss failed: ${extractErrorMessage(err)}`));
    },
    [dismissItem, showError],
  );

  function handleSaveLabel() {
    updateGmailLabel({ label: labelInput.trim() })
      .unwrap()
      .then(() => showSuccess(labelInput.trim() ? `Got it, I'll only sync emails with the "${labelInput.trim()}" label` : "Label filter cleared - I'll sync all emails now"))
      .catch((err) => showError(`Couldn't save label: ${extractErrorMessage(err)}`));
  }

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <SectionHeader title="Integrations" />

      {!infoDismissed && (
        <AlertBox variant="info" className="flex items-center justify-between gap-3">
          <span>
            Connect Gmail and I&rsquo;ll automatically scan your inbox for financial documents &mdash; invoices, receipts, 1099s &mdash; and import them for you. I only read emails with attachments; I never store your email content.
          </span>
          <button
            onClick={dismissInfo}
            aria-label="Dismiss"
            className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-800 dark:text-blue-200 shrink-0"
          >
            <X size={14} />
          </button>
        </AlertBox>
      )}

      {isLoading ? (
        <IntegrationsSkeleton />
      ) : (
        <>
          {/* Gmail */}
          <section className="border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Gmail</p>
                {gmail ? (
                  gmail.needs_reauth ? (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-0.5" data-testid="gmail-needs-reauth-status">
                      Reconnection required — token expired
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Connected · Last synced{" "}
                      {gmail.last_synced_at ? timeAgo(gmail.last_synced_at) : "never"}
                    </p>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Automatically import documents from your inbox
                  </p>
                )}
              </div>

              {canWrite ? (
                <div className="flex gap-2">
                  {gmail ? (
                    <>
                      {gmail.needs_reauth ? (
                        /* Token expired — show Reconnect instead of Sync/Disconnect.
                           The OAuth flow replaces the tokens without requiring a disconnect. */
                        <LoadingButton
                          onClick={handleConnect}
                          isLoading={isConnecting}
                          loadingText="Reconnecting..."
                          data-testid="gmail-reconnect-button"
                        >
                          Reconnect Gmail
                        </LoadingButton>
                      ) : (
                        <>
                          {confirmSync ? (
                            <div className="flex items-center gap-2 border rounded-md px-3 py-1.5 text-sm">
                              <span className="text-muted-foreground">Start email sync?</span>
                              <button onClick={handleSync} className="text-primary font-medium hover:underline">Yes</button>
                              <button onClick={() => setConfirmSync(false)} className="text-muted-foreground hover:text-foreground">No</button>
                            </div>
                          ) : (
                            <LoadingButton
                              variant="secondary"
                              onClick={() => setConfirmSync(true)}
                              disabled={isSyncing}
                              isLoading={isSyncing || isSyncStarting}
                              loadingText="Syncing..."
                            >
                              Sync now
                            </LoadingButton>
                          )}
                          {isSyncing ? (
                            <LoadingButton
                              variant="ghost"
                              onClick={() => handleCancel(latestLog?.id)}
                              isLoading={isCancelling}
                              loadingText="Cancelling..."
                              className="text-destructive hover:text-destructive"
                            >
                              Cancel
                            </LoadingButton>
                          ) : confirmDisconnect ? (
                            <div className="flex items-center gap-2 border rounded-md px-3 py-1.5 text-sm">
                              <span className="text-muted-foreground">Disconnect Gmail?</span>
                              <button
                                onClick={handleDisconnect}
                                className="text-destructive font-medium hover:underline"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setConfirmDisconnect(false)}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <LoadingButton
                              variant="ghost"
                              onClick={() => setConfirmDisconnect(true)}
                              isLoading={isDisconnecting}
                              loadingText="Disconnecting..."
                              className="text-destructive hover:text-destructive"
                            >
                              Disconnect
                            </LoadingButton>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <LoadingButton onClick={handleConnect} isLoading={isConnecting} loadingText="Connecting...">
                      Connect Gmail
                    </LoadingButton>
                  )}
                </div>
              ) : null}
            </div>

            {gmail ? (
              <div className="mt-4 pt-4 border-t">
                <label className="text-sm font-medium text-muted-foreground block mb-1.5">
                  Only sync emails with label
                </label>
                {canWrite ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={labelInput}
                      onChange={(e) => setLabelInput(e.target.value)}
                      placeholder="e.g. Receipts"
                      className="border rounded-md px-3 py-1.5 text-sm w-48 bg-background"
                    />
                    <LoadingButton
                      variant="secondary"
                      size="sm"
                      onClick={handleSaveLabel}
                      isLoading={isSavingLabel}
                      loadingText="Saving..."
                      disabled={labelInput.trim() === (typeof savedLabel === "string" ? savedLabel : "")}
                    >
                      Save
                    </LoadingButton>
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground mt-1">
                  {typeof savedLabel === "string" && savedLabel
                    ? `Currently filtering by: "${savedLabel}"`
                    : "Leave empty to sync all emails"}
                </p>
              </div>
            ) : null}
          </section>

          {gmail && syncLogs.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Sync Sessions
                </p>
                {canWrite ? (
                  <div className="flex items-center gap-2">
                    {fetchedCount > 0 ? (
                      <LoadingButton
                        variant="secondary"
                        size="sm"
                        onClick={handleExtractAll}
                        isLoading={isExtracting}
                        loadingText={`Extracting (${extractingCount})...`}
                      >
                        Extract All ({fetchedCount})
                      </LoadingButton>
                    ) : isExtracting ? (
                      <LoadingButton
                        variant="secondary"
                        size="sm"
                        isLoading
                        loadingText={`Extracting (${extractingCount})...`}
                        disabled
                      >
                        Extracting
                      </LoadingButton>
                    ) : null}
                    {failedCount > 0 ? (
                      <LoadingButton
                        variant="secondary"
                        size="sm"
                        onClick={handleRetryAll}
                        isLoading={isRetrying}
                        loadingText="Retrying..."
                      >
                        Retry Failed ({failedCount})
                      </LoadingButton>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {syncLogs.map((log, i) => (
                <SyncLogRow
                  key={log.id}
                  log={log}
                  queueItems={queueBySession.get(log.id)}
                  onRetryItem={canWrite ? handleRetryItem : undefined}
                  onDismissItem={canWrite ? handleDismissItem : undefined}
                  onCancel={canWrite ? handleCancel : undefined}
                  isCancelling={isCancelling}
                  defaultOpen={i === 0}
                />
              ))}
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
