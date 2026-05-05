import type { SyncLog } from "@/shared/types/integration/sync-log";
import type { SyncLogFunnelMode } from "@/shared/types/integration/sync-log-funnel-mode";

export interface SyncLogFunnelStatsProps {
  mode: SyncLogFunnelMode;
  log: SyncLog;
}

export default function SyncLogFunnelStats({ mode, log }: SyncLogFunnelStatsProps) {
  switch (mode) {
    case "modern":
      return (
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
      );
    case "legacy":
      return (
        <>
          <span>Emails found</span>
          <span>{log.emails_total}</span>
          <span>Fetched from Gmail</span>
          <span>{log.emails_fetched}</span>
          <span>Extracted by Claude</span>
          <span>{log.emails_done}</span>
        </>
      );
    case "none":
      return null;
  }
}
