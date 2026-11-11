import { MS_PER_DAY } from "../constants/stageAge";

/** Whole days since the card entered its stage, or null without a readable date. */
export function daysInStage(stageEnteredAt: string | null, now: number): number | null {
  if (!stageEnteredAt) return null;
  const ms = now - new Date(stageEnteredAt).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / MS_PER_DAY);
}
