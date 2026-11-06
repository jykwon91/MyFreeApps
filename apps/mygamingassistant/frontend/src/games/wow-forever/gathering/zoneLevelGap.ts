import { UNKNOWN_LEVEL_GAP } from "@/games/wow-forever/data/professions/gathering/gatheringConfig";

/** How far your level is outside a zone's Forever level range (0 inside it; a zone with no range counts as far off). */
export function zoneLevelGap(levels: readonly [number, number] | null, level: number): number {
  if (!levels) return UNKNOWN_LEVEL_GAP;
  return Math.max(0, levels[0] - level, level - levels[1]);
}
