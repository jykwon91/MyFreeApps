/** Why a point can't be added to, or taken from, a talent. */
export type TalentBlock =
  | { kind: "maxed" }
  | { kind: "no-points" }
  | { kind: "tier"; pointsNeeded: number }
  | { kind: "prereq"; talentIndex: number; rank: number }
  | { kind: "empty" }
  | { kind: "dependent"; talentIndex: number }
  | { kind: "tier-above"; tier: number };
