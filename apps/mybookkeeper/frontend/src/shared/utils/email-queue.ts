import type { EmailQueueItem } from "@/shared/types/integration/email-queue";
import type { StatusCounts } from "@/shared/types/integration/status-counts";
import type { SessionGroup } from "@/shared/types/integration/session-group";

export function computeStatusCounts(queue: readonly EmailQueueItem[]): StatusCounts {
  let fetched = 0;
  let extracting = 0;
  let failed = 0;
  for (const item of queue) {
    if (item.status === "fetched") fetched++;
    else if (item.status === "extracting") extracting++;
    else if (item.status === "failed") failed++;
  }
  return { fetched, extracting, failed };
}

export function groupBySession(queue: readonly EmailQueueItem[]): SessionGroup[] {
  const groupMap = new Map<number, EmailQueueItem[]>();
  for (const item of queue) {
    const existing = groupMap.get(item.sync_log_id);
    if (existing) {
      existing.push(item);
    } else {
      groupMap.set(item.sync_log_id, [item]);
    }
  }

  const groups: SessionGroup[] = [];
  for (const [syncLogId, items] of groupMap) {
    const earliestCreatedAt = items[items.length - 1]?.created_at ?? null;
    groups.push({ syncLogId, items, earliestCreatedAt });
  }

  groups.sort((a, b) => b.syncLogId - a.syncLogId);
  return groups;
}
