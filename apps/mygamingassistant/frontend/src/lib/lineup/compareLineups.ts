import type { Lineup } from "@/types/game";
import { utilDisplay } from "@/constants/utilityDisplay";
import { SIDE_ORDER } from "@/constants/lineupOrdering";

/** Within-zone order: utility type (per utilDisplay), then side (T, CT, both). */
export function compareLineups(a: Lineup, b: Lineup): number {
  const utilA = utilDisplay(a.utility_type?.slug).sortOrder;
  const utilB = utilDisplay(b.utility_type?.slug).sortOrder;
  if (utilA !== utilB) return utilA - utilB;
  const sideA = SIDE_ORDER[a.side ?? "any"] ?? 99;
  const sideB = SIDE_ORDER[b.side ?? "any"] ?? 99;
  return sideA - sideB;
}
