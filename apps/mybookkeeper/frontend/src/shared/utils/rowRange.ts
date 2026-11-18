/** The ids from one row to another, inclusive; just the target when the anchor isn't in the list. */
export function idsBetween(ids: readonly string[], anchorId: string, targetId: string): string[] {
  const anchor = ids.indexOf(anchorId);
  const target = ids.indexOf(targetId);
  if (anchor === -1 || target === -1) return [targetId];
  return ids.slice(Math.min(anchor, target), Math.max(anchor, target) + 1);
}
