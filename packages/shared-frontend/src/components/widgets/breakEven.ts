import type { ProgressTone } from "../ui/ProgressBar";

export interface BreakEvenState {
  /** Donations as a percentage of costs (0–∞; the bar clamps the visual to 100). */
  pct: number;
  tone: ProgressTone;
  goalMet: boolean;
  noDonations: boolean;
}

/** Pure derivation of the break-even state from raw cent amounts. */
export function deriveBreakEven(donationsCents: number, costsCents: number): BreakEvenState {
  const pct = costsCents > 0 ? (donationsCents / costsCents) * 100 : 0;
  const goalMet = costsCents > 0 && donationsCents >= costsCents;
  const noDonations = donationsCents === 0;

  let tone: ProgressTone = "warning";
  if (goalMet) tone = "success";
  else if (pct >= 50) tone = "primary";

  return { pct, tone, goalMet, noDonations };
}

/** Short, human status line shown under the progress bar. */
export function breakEvenStatusLine(state: BreakEvenState): string {
  if (state.goalMet) return "You've covered this month's costs — thank you.";
  if (state.noDonations) return "No donations yet this month — be the first.";
  return `${Math.round(state.pct)}% of this month's costs covered.`;
}
