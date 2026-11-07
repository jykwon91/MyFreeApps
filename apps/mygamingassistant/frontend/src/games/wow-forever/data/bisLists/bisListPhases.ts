/**
 * What a list is for. Deliberately generic: Forever's raid phases aren't
 * published, so no raid names or phase numbers.
 */
export const BIS_LIST_PHASE = { leveling: "leveling", preraid: "preraid", raid: "raid" } as const;

export type BisListPhase = (typeof BIS_LIST_PHASE)[keyof typeof BIS_LIST_PHASE];

export const BIS_LIST_PHASES: readonly { id: BisListPhase; label: string }[] = [
  { id: BIS_LIST_PHASE.leveling, label: "Leveling" },
  { id: BIS_LIST_PHASE.preraid, label: "Pre-raid" },
  { id: BIS_LIST_PHASE.raid, label: "Raid" },
];

export const DEFAULT_BIS_LIST_PHASE: BisListPhase = BIS_LIST_PHASE.preraid;

export function isBisListPhase(value: unknown): value is BisListPhase {
  return BIS_LIST_PHASES.some((p) => p.id === value);
}

export function bisListPhaseLabel(phase: BisListPhase): string {
  return BIS_LIST_PHASES.find((p) => p.id === phase)?.label ?? phase;
}
