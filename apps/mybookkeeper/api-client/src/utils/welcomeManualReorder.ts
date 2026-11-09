/** Returns a copy with the item at `index` moved by `delta` places; out-of-range moves change nothing. */
export function moveItem<T>(items: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];
  const out = [...items];
  const [moved] = out.splice(index, 1);
  out.splice(target, 0, moved);
  return out;
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
