/** True when every space-separated word of `query` appears (any case) in at least one of `haystacks`; an empty query matches all. */
export function matchesSearch(haystacks: readonly string[], query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const lowered = haystacks.map((h) => h.toLowerCase());
  return words.every((word) => lowered.some((h) => h.includes(word)));
}
