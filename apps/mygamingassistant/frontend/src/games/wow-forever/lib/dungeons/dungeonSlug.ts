/** "Zul'Farrak" → "zulfarrak", "Mr. Smite" → "mr-smite": apostrophes dropped, anything else not a letter or digit is a dash. */
export function dungeonSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Slugs for names in order, a repeat getting "-2", "-3" so every anchor is unique. */
export function uniqueSlugs(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const base = dungeonSlug(name);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  });
}
