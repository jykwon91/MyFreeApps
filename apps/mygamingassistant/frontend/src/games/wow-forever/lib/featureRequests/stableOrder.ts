/**
 * `items` in the order they were first shown: ids seen before keep their place, new ids go to the end,
 * ids the server no longer returns drop out. A background refetch (window focus, a vote) can change counts
 * — and so the server's "top" order — but the list never re-sorts under the player's finger.
 */
export function stableOrder<T extends { id: string }>(previousIds: readonly string[], items: readonly T[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const kept: T[] = [];
  for (const id of previousIds) {
    const item = byId.get(id);
    if (item === undefined) continue;
    kept.push(item);
    byId.delete(id);
  }
  return [...kept, ...items.filter((item) => byId.has(item.id))];
}
