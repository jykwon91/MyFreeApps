/** Shared text matching for the World Map's search boxes. */

/** Lower case, accents and punctuation dropped: "Grom'gol" -> "gromgol", "Un'Goro" -> "ungoro". */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

export function queryTokens(query: string): string[] {
  return normalizeText(query).split(" ").filter(Boolean);
}

/** Every token appears somewhere in the text (order doesn't matter). */
export function matchesAll(tokens: readonly string[], haystack: string): boolean {
  return tokens.length > 0 && tokens.every((t) => haystack.includes(t));
}

/** 0 = exact, 1 = starts with the query, 2 = a word starts with it, 3 = anywhere. */
export function nameScore(name: string, query: string): number {
  const n = normalizeText(name);
  const q = normalizeText(query);
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.split(" ").some((word) => word.startsWith(q))) return 2;
  return 3;
}
