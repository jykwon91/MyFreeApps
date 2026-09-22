import { findClass, findSpec } from "@/games/wow-forever/data/classes";
import type { WeightSource } from "@/games/wow-forever/scoring/resolveWeights";
import type { CompareSettings } from "@/games/wow-forever/types/compareSettings";

/** Human label for the weight table in use, e.g. "Pawn Classic Era scale — Arms Warrior". */
export function describeWeights(settings: CompareSettings, source: WeightSource): string {
  const className = findClass(settings.classId)?.name ?? settings.classId;
  if (source === "leveling-heuristic") return `leveling rule of thumb — ${className}`;
  const specName = findSpec(settings.classId, settings.specId)?.name ?? settings.specId;
  return `Pawn Classic Era scale — ${specName} ${className}`;
}
