import type { SyncLog } from "@/shared/types/integration/sync-log";

export function getStatusColor(status: SyncLog["status"]): string {
  if (status === "success") return "text-green-700";
  if (status === "failed") return "text-red-600";
  if (status === "partial") return "text-amber-600";
  if (status === "cancelled") return "text-muted-foreground";
  return "text-blue-600";
}

export function getStatusLabel(log: SyncLog): string {
  if (log.status === "running") {
    return `Syncing\u2026 ${log.emails_fetched} of ${log.emails_total} fetched, ${log.emails_done} extracted`;
  }
  if (log.status === "success") {
    const count = log.records_added ?? 0;
    return `${count} document${count !== 1 ? "s" : ""} added`;
  }
  if (log.status === "partial") {
    const count = log.records_added ?? 0;
    return `Partial \u2014 ${count} document${count !== 1 ? "s" : ""} added, some items failed`;
  }
  if (log.status === "cancelled") {
    const count = log.records_added ?? 0;
    return count > 0
      ? `Cancelled \u2014 ${count} document${count !== 1 ? "s" : ""} added before cancellation`
      : "Cancelled";
  }
  return "Failed";
}
