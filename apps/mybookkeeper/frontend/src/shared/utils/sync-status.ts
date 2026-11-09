import type { SyncLog } from "@mybookkeeper/api-client/types/integration/sync-log";

export function getStatusColor(status: SyncLog["status"]): string {
  if (status === "success") return "text-green-700";
  if (status === "failed") return "text-red-600";
  if (status === "partial") return "text-amber-600";
  if (status === "cancelled") return "text-muted-foreground";
  return "text-blue-600";
}
