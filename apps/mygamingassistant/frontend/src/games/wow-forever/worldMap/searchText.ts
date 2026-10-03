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

/** Typos forgiven in a typed word this long: none under 4 letters, 1 up to 7, 2 from 8. */
export function allowedEdits(length: number): number {
  if (length < 4) return 0;
  return length < 8 ? 1 : 2;
}

/** Edits (insert, delete, change, swap two neighbours) to turn `a` into `b`. */
export function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const change = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + change);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  }
  return rows[a.length][b.length];
}
