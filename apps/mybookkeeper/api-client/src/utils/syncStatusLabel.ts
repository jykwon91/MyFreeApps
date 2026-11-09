import type { SyncLog } from "../types/integration/sync-log";

function documents(count: number): string {
  return `${count} document${count !== 1 ? "s" : ""}`;
}

export function getStatusLabel(log: SyncLog): string {
  if (log.status === "running") {
    return `Syncing… ${log.emails_fetched} of ${log.emails_total} fetched, ${log.emails_done} extracted`;
  }
  const count = log.records_added ?? 0;
  if (log.status === "success") return `${documents(count)} added`;
  if (log.status === "partial") return `Partial — ${documents(count)} added, some items failed`;
  if (log.status === "cancelled") {
    return count > 0 ? `Cancelled — ${documents(count)} added before cancellation` : "Cancelled";
  }
  return "Failed";
}
