/**
 * Join names the way they'd be read aloud: `"A, B and C"`.
 *
 * Written out rather than delegated to `Intl.ListFormat`, which needs a
 * `lib: ES2021` bump this app doesn't otherwise want. Six lines here beats
 * widening the whole compile surface for one conjunction.
 *
 * Serial comma omitted deliberately — the only caller is a sentence an
 * operator reads to their insurance agent.
 */
export function joinWithAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  const head = items.slice(0, -1);
  const tail = items[items.length - 1];
  return `${head.join(", ")} and ${tail}`;
}
