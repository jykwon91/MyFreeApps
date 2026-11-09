/** The ticked ids still in `validIds`. Returns `selected` itself when nothing dropped, so state doesn't churn. */
export function pruneSelection(selected: ReadonlySet<string>, validIds: Iterable<string>): ReadonlySet<string> {
  const valid = new Set(validIds);
  const kept = [...selected].filter((id) => valid.has(id));
  return kept.length === selected.size ? selected : new Set(kept);
}
