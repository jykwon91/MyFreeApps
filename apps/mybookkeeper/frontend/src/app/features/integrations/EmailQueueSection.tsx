import { useCallback, useMemo, useState } from "react";
import {
  useGetEmailQueueQuery,
  useExtractAllMutation,
  useDismissQueueItemMutation,
  useRetryQueueItemMutation,
  useRetryAllFailedMutation,
} from "@/shared/store/integrationsApi";
import { POLLING_OPTIONS, EMPTY_QUEUE } from "@/shared/lib/constants";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import { computeStatusCounts, groupBySession } from "@/shared/utils/email-queue";
import { timeAgo } from "@/shared/utils/date";
import { useToast } from "@/shared/hooks/useToast";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Button from "@/shared/components/ui/Button";
import ChevronDown from "@/shared/components/icons/ChevronDown";
import QueueItem from "./QueueItem";

export default function EmailQueueSection() {
  const { data: queue = EMPTY_QUEUE } = useGetEmailQueueQuery(
    undefined,
    POLLING_OPTIONS,
  );
  const [extractAll] = useExtractAllMutation();
  const [dismissItem] = useDismissQueueItemMutation();
  const [retryItem] = useRetryQueueItemMutation();
  const [retryAllFailed, { isLoading: isRetrying }] =
    useRetryAllFailedMutation();
  const { showError, showSuccess } = useToast();

  const counts = useMemo(() => computeStatusCounts(queue), [queue]);
  const sessionGroups = useMemo(() => groupBySession(queue), [queue]);
  const isExtracting = counts.extracting > 0;
  const allDone = counts.fetched === 0 && counts.extracting === 0 && counts.failed === 0;
  const [expanded, setExpanded] = useState(true);

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

  if (queue.length === 0) return null;

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center justify-between w-full"
      >
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Email Queue
        </p>
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {counts.fetched > 0 ? (
              <span>{counts.fetched} fetched</span>
            ) : null}
            {counts.extracting > 0 ? (
              <span>{counts.fetched > 0 ? " · " : ""}{counts.extracting} extracting</span>
            ) : null}
            {counts.failed > 0 ? (
              <span>{counts.fetched > 0 || counts.extracting > 0 ? " · " : ""}{counts.failed} failed</span>
            ) : null}
            {allDone ? (
              <span>All items processed ({queue.length})</span>
            ) : null}
          </p>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {expanded ? (
        <>
          {!allDone ? (
            <div className="flex items-center justify-end gap-2">
              {counts.fetched > 0 ? (
                <LoadingButton
                  variant="secondary"
                  size="sm"
                  onClick={handleExtractAll}
                  isLoading={isExtracting}
                  loadingText={`Extracting (${counts.extracting})...`}
                >
                  Extract All ({counts.fetched})
                </LoadingButton>
              ) : isExtracting ? (
                <LoadingButton
                  variant="secondary"
                  size="sm"
                  isLoading
                  loadingText={`Extracting (${counts.extracting})...`}
                  disabled
                >
                  Extracting
                </LoadingButton>
              ) : null}
              {counts.failed > 0 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRetryAll}
                  disabled={isRetrying}
                >
                  Retry Failed ({counts.failed})
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-3">
            {sessionGroups.map((group) => (
              <div key={group.syncLogId} className="border rounded-md overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b">
                  <p className="text-xs font-medium text-muted-foreground">
                    Sync session {group.earliestCreatedAt ? `\u00b7 ${timeAgo(group.earliestCreatedAt)}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {group.items.length} item{group.items.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="divide-y max-h-60 overflow-y-auto">
                  {group.items.map((item) => (
                    <QueueItem
                      key={item.id}
                      item={item}
                      onRetry={handleRetryItem}
                      onDismiss={handleDismissItem}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
