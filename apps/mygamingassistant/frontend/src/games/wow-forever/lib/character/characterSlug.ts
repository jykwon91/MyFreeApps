/** "Jason Kwon" (or "jason-kwon") → "jason-kwon": Blizzard's address for a Forever character. */
const NAME_PART = /^\p{L}{2,24}$/u;

export function characterSlugFromName(input: string): string | null {
  const parts = input.trim().toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (parts.length !== 2 || !parts.every((part) => NAME_PART.test(part))) return null;
  return parts.join("-");
}

/** "jason-kwon" → "Jason Kwon", for a remembered name shown before its sheet loads. */
export function characterNameFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
