/**
 * The inbox cards in the order first shown. Ids already shown keep their place, ids the server dropped
 * leave; ids that arrived after the first read wait behind the "N new — Show" pill (`unseen`) unless
 * nothing is shown yet. Cards never reorder under the operator's thumb. Pure.
 */
export function stableInboxOrder<T>(
  shownIds: readonly string[],
  items: readonly T[],
  idOf: (item: T) => string,
): { shown: T[]; unseen: string[] } {
  const byId = new Map(items.map((item) => [idOf(item), item]));
  const shown: T[] = [];
  for (const id of shownIds) {
    const item = byId.get(id);
    if (item !== undefined) shown.push(item);
  }
  const known = new Set(shownIds);
  const unseen = items.map(idOf).filter((id) => !known.has(id));
  return { shown, unseen };
}
