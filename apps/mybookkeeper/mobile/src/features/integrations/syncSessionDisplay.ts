import { syncLogFunnelMode } from "@mybookkeeper/api-client/utils/syncLogFunnelMode";
import type { SyncLog } from "@mybookkeeper/api-client/types/integration/sync-log";
import type { SyncLogStatus } from "@mybookkeeper/api-client/types/integration/sync-log-status";
import type { ThemeColors } from "@platform/mobile";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../../constants/integrations";
import type { FunnelRow } from "../../types/FunnelRow";

/** The funnel from what Gmail matched to what Claude read, in the order the website shows it. */
export function funnelRows(log: SyncLog): FunnelRow[] {
  switch (syncLogFunnelMode(log)) {
    case "modern": {
      const rows: FunnelRow[] = [
        { label: MESSAGES.gmailMatches, value: log.gmail_matches_total },
        { label: MESSAGES.newAfterDedup, value: log.emails_total },
      ];
      if (log.emails_total > 0) {
        rows.push({ label: MESSAGES.fetchedFromGmail, value: log.emails_fetched }, { label: MESSAGES.extractedByClaude, value: log.emails_done });
      }
      return rows;
    }
    case "legacy":
      return [
        { label: MESSAGES.emailsFound, value: log.emails_total },
        { label: MESSAGES.fetchedFromGmail, value: log.emails_fetched },
        { label: MESSAGES.extractedByClaude, value: log.emails_done },
      ];
    case "none":
      return [];
  }
}

/**
 * What to say under "Emails in this sync" when none of the recent queue belongs to it. The queue only
 * holds the newest emails, so "none were queued" is claimed only when the sync's own numbers say so.
 */
export function noItemsMessage(log: SyncLog): string {
  if (log.emails_total > 0) return MESSAGES.itemsGone(log.emails_total);
  return log.status === "running" ? MESSAGES.itemsNoneYet : MESSAGES.itemsNone;
}

/** Said when only some of the emails a sync queued are still in the recent queue; null when nothing is missing. */
export function partialItemsMessage(log: SyncLog, shown: number): string | null {
  return shown > 0 && shown < log.emails_total ? MESSAGES.itemsPartial(shown, log.emails_total) : null;
}

/** Meaning is always in the words too; colour only reinforces it. */
export function syncStatusColor(colors: ThemeColors, status: SyncLogStatus): string {
  switch (status) {
    case "success":
      return colors.positiveText;
    case "failed":
      return colors.destructiveText;
    case "running":
      return colors.primary;
    case "partial":
    case "cancelled":
      return colors.foreground;
  }
}
