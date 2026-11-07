/**
 * What a list is for. Deliberately generic: Forever's raid phases aren't
 * published, so no raid names or phase numbers.
 */
export const BIS_LIST_PHASES = [
  { id: "leveling", label: "Leveling" },
  { id: "preraid", label: "Pre-raid" },
  { id: "raid", label: "Raid" },
] as const;

export type BisListPhase = (typeof BIS_LIST_PHASES)[number]["id"];

export const DEFAULT_BIS_LIST_PHASE: BisListPhase = "preraid";

export function isBisListPhase(value: unknown): value is BisListPhase {
  return BIS_LIST_PHASES.some((p) => p.id === value);
}

export function bisListPhaseLabel(phase: BisListPhase): string {
  return BIS_LIST_PHASES.find((p) => p.id === phase)?.label ?? phase;
}
