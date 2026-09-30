import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";
import type { FactionText } from "@/games/wow-forever/data/professions/professionTypes";

/** Resolve text that may differ per faction. */
export function forFaction(text: FactionText, faction: PlayerFaction): string {
  if (typeof text === "string") return text;
  return text[faction];
}
