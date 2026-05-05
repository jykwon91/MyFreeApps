import type { SyncLog } from "@/shared/types/integration/sync-log";
import type { SyncLogFunnelMode } from "@/shared/types/integration/sync-log-funnel-mode";

/**
 * Resolves which funnel stats block the SyncLogRow should render.
 *
 * - "modern"  — log has gmail_matches_total > 0 (includes dedup funnel).
 * - "legacy"  — pre-#235 log without gmail_matches_total but with emails.
 * - "none"    — no email stats to show.
 */
export function useSyncLogFunnelMode(log: SyncLog): SyncLogFunnelMode {
  if (log.gmail_matches_total > 0) return "modern";
  if (log.emails_total > 0) return "legacy";
  return "none";
}
