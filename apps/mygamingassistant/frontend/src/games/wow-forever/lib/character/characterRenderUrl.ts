import { CHARACTER_API_BASE } from "@/games/wow-forever/data/character/characterConfig";

/** The character's render, cropped to them by the API (Blizzard's image, served from our origin). */
export function characterRenderUrl(slug: string): string {
  return `${CHARACTER_API_BASE}/${encodeURIComponent(slug)}/render.png`;
}
