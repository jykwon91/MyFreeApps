import { STAGE_AGE_DANGER_DAYS, STAGE_AGE_VISIBLE_DAYS, STAGE_AGE_WARNING_DAYS } from "../constants/stageAge";
import type { StatusTone } from "../types/status-tone";

/** The tone of a card's days-in-stage badge, or null when it's too fresh to show one. */
export function stageAgeTone(days: number | null): StatusTone | null {
  if (days === null || days < STAGE_AGE_VISIBLE_DAYS) return null;
  if (days >= STAGE_AGE_DANGER_DAYS) return "danger";
  if (days >= STAGE_AGE_WARNING_DAYS) return "warning";
  return "neutral";
}
