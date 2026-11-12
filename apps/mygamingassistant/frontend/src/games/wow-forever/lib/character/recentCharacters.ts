import { RECENT_CHARACTERS_MAX } from "@/games/wow-forever/data/character/characterConfig";
import { characterSlugFromName } from "@/games/wow-forever/lib/character/characterSlug";

/** A stored list of slugs, kept only if it still reads as one. */
export function parseRecentCharacters(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const slugs = raw.filter((v): v is string => typeof v === "string" && characterSlugFromName(v) === v);
  return slugs.slice(0, RECENT_CHARACTERS_MAX);
}

/** `slug` first, then the rest without it, up to the cap. */
export function withRecentCharacter(recent: readonly string[], slug: string): string[] {
  return [slug, ...recent.filter((s) => s !== slug)].slice(0, RECENT_CHARACTERS_MAX);
}
