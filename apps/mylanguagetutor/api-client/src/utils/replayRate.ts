import { NORMAL_RATE, SLOW_RATE } from "../constants/speechRates";

/** The rate a reply is played again at: "Replay" at the normal pace, "Slow" slower. */
export function replayRate(slow: boolean): number {
  return slow ? SLOW_RATE : NORMAL_RATE;
}
