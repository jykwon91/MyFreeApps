import { format } from "date-fns";
import type { PlaidSyncResult } from "../types/plaid/plaid-sync-result";

/** A sync timestamp as "Nov 23, 3:04 PM", in the person's own time zone. */
export function formatLastSynced(value: string): string {
  return format(new Date(value), "MMM d, h:mm a");
}

/** What a sync changed, as "3 new, 1 updated, 1 removed"; empty when nothing did. */
export function describeSyncChanges(result: PlaidSyncResult): string {
  const parts: string[] = [];
  if (result.added > 0) parts.push(`${result.added} new`);
  if (result.modified > 0) parts.push(`${result.modified} updated`);
  if (result.removed > 0) parts.push(`${result.removed} removed`);
  return parts.join(", ");
}
