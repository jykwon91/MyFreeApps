import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";

/**
 * Where to go after approving `currentId`: the next row in the order the person
 * was working through, skipping anything someone dealt with in the meantime.
 */
export function nextToReview(before: readonly Transaction[], after: readonly Transaction[], currentId: string): string | null {
  const stillWaiting = new Set(after.map((row) => row.id));
  stillWaiting.delete(currentId);
  const position = before.findIndex((row) => row.id === currentId);
  const later = before.slice(position + 1).find((row) => stillWaiting.has(row.id));
  return later?.id ?? after.find((row) => row.id !== currentId)?.id ?? null;
}
