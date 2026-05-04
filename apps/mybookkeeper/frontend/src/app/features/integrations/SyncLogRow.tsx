import { useCallback, useState } from "react";
import type { SyncLog } from "@/shared/types/integration/sync-log";
import type { EmailQueueItem } from "@/shared/types/integration/email-queue";
import { formatDate, timeAgo } from "@/shared/utils/date";
import { getStatusColor, getStatusLabel } from "@/shared/utils/sync-status";
import Spinner from "@/shared/components/icons/Spinner";
import ChevronDown from "@/shared/components/icons/ChevronDown";
import ProgressBar from "./ProgressBar";
import QueueItem from "./QueueItem";

interface Props {
  log: SyncLog;
  queueItems?: readonly EmailQueueItem[];
  onRetryItem?: (id: string) => void;
  onDismissItem?: (id: string) => void;
  onCancel?: (syncLogId: number) => void;
  isCancelling?: boolean;
  defaultOpen?: boolean;
}

export default function SyncLogRow({
  log,
  queueItems = [],
  onRetryItem,
  onDismissItem,
  onCancel,
  isCancelling = false,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  const statusColor = getStatusColor(log.status);
  const statusLabel = getStatusLabel(log);
  const handleRetry = useCallback((id: string) => onRetryItem?.(id), [onRetryItem]);
  const handleDismiss = useCallback((id: string) => onDismissItem?.(id), [onDismissItem]);

  return (
    <div className="border rounded-md overflow-hidden text-sm">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
        onClick={toggle}
      >
        <div className="flex items-center gap-3">
          {log.status === "running" ? <Spinner className="h-3.5 w-3.5 text-blue-500 shrink-0" /> : null}
          <span className="text-muted-foreground font-mono text-xs">#{log.id}</span>
          <span className={`font-medium ${statusColor}`}>{statusLabel}</span>
          {queueItems.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              ({queueItems.length} item{queueItems.length !== 1 ? "s" : ""})
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <span>{timeAgo(log.started_at)}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open ? (
        <div className="border-t">
          <div className="px-4 py-3 bg-muted/20 space-y-2 text-xs text-muted-foreground">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1">
              <span>Started</span>
              <span>{formatDate(log.started_at)}</span>
              {log.completed_at ? (
                <>
                  <span>Completed</span>
                  <span>{formatDate(log.completed_at)}</span>
                </>
              ) : null}
              {/* Funnel — render whenever Gmail returned at least one match */}
              {/* (lets the user see "100 matched, 100 already processed, 0 new") */}
              {log.gmail_matches_total > 0 ? (
                <>
                  <span>Gmail matches</span>
                  <span>{log.gmail_matches_total}</span>
                  <span>New (after dedup)</span>
                  <span>{log.emails_total}</span>
                  {log.emails_total > 0 ? (
                    <>
                      <span>Fetched from Gmail</span>
                      <span>{log.emails_fetched}</span>
                      <span>Extracted by Claude</span>
                      <span>{log.emails_done}</span>
                    </>
                  ) : null}
                </>
              ) : log.emails_total > 0 ? (
                /* Legacy sync_logs (pre-#235) without gmail_matches_total */
                <>
                  <span>Emails found</span>
                  <span>{log.emails_total}</span>
                  <span>Fetched from Gmail</span>
                  <span>{log.emails_fetched}</span>
                  <span>Extracted by Claude</span>
                  <span>{log.emails_done}</span>
                </>
              ) : null}
              <span>Documents added</span>
              <span>{log.records_added ?? 0}</span>
            </div>
            {log.status === "running" && log.emails_total > 0 ? (
              <ProgressBar done={log.emails_done} total={log.emails_total} />
            ) : null}
            {log.status === "running" && onCancel ? (
              <button
                onClick={() => onCancel(log.id)}
                disabled={isCancelling}
                className="text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
              >
                {isCancelling ? "Cancelling\u2026" : "Cancel this sync"}
              </button>
            ) : null}
            {log.error ? (
              <p className="font-mono text-red-600 bg-red-50 rounded p-2 break-all">
                {log.error}
              </p>
            ) : null}
          </div>

          {queueItems.length > 0 ? (
            <div className="divide-y border-t max-h-60 overflow-y-auto">
              {queueItems.map((item) => (
                <QueueItem
                  key={item.id}
                  item={item}
                  onRetry={handleRetry}
                  onDismiss={handleDismiss}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
