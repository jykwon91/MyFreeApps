import { levelRange } from "@/games/wow-forever/food/recipeSources";
import type { GatheringZone } from "@/games/wow-forever/types/gathering/gatheringZone";

/** "Mobs here are level 35–45 — above you." / "Zone level 10–20." / "" when Forever has no levels for it. */
export function zoneLevelNote(zone: Pick<GatheringZone, "levels" | "aboveYou">): string {
  if (!zone.levels) return "";
  if (zone.aboveYou) return `Mobs here are ${levelRange(zone.levels)} — above you.`;
  return `Zone ${levelRange(zone.levels)}.`;
}
