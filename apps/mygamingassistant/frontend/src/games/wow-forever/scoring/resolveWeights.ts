import { findSpec, LEVELING_SPEC_ID } from "@/games/wow-forever/data/classes";
import { LEVELING_WEIGHTS } from "@/games/wow-forever/data/weights/levelingWeights";
import { PAWN_CLASSIC_WEIGHTS } from "@/games/wow-forever/data/weights/pawnClassicWeights";
import type { StatWeights } from "@/games/wow-forever/data/weights/statWeights";
import type { CompareSettings } from "@/games/wow-forever/types/compareSettings";

export type WeightSource = "pawn-classic" | "leveling-heuristic";

export interface ResolvedWeights {
  weights: StatWeights;
  source: WeightSource;
  notes: string[];
}

/**
 * Pick the weight table for the chosen class/spec/bracket.
 *
 * - Leveling bracket, or spec "Leveling (any)": the class leveling heuristic.
 * - Level 60 + a real spec: Pawn's Classic scale for that spec.
 */
export function resolveWeights(settings: CompareSettings): ResolvedWeights {
  const { classId, specId, bracket } = settings;
  const spec = findSpec(classId, specId);
  const pawn = PAWN_CLASSIC_WEIGHTS[`${classId}/${specId}`];

  if (bracket === "level60" && spec && pawn) {
    return { weights: pawn, source: "pawn-classic", notes: [] };
  }

  const notes: string[] = [];
  if (bracket === "level60" && specId === LEVELING_SPEC_ID) {
    notes.push("Pick a spec to use Level 60 weights — using leveling weights for now.");
  }
  return { weights: LEVELING_WEIGHTS[classId], source: "leveling-heuristic", notes };
}
