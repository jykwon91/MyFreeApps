import { RANK_RECIPES_COPY, TRAINER_PANEL_COPY } from "@/games/wow-forever/data/trainers/trainersConfig";
import type { TrainerRecipeRow } from "@/games/wow-forever/types/trainers/trainerRecipeRow";

/** " · 3 you can learn" / " · all known" after a rank's toggle when a character marks the rows; "" otherwise. */
export function rankMarkedSuffix(rows: readonly TrainerRecipeRow[], marked: boolean): string {
  if (!marked || rows.length === 0) return "";
  if (rows.every((r) => r.status === "known")) return RANK_RECIPES_COPY.allKnown;
  const canLearn = rows.filter((r) => r.status === "can-learn").length;
  return canLearn > 0 ? RANK_RECIPES_COPY.canLearn(canLearn) : "";
}

/**
 * The trainer panel's summary: of the recipes you don't know yet (and that a skill can be weighed for),
 * how many you can learn now. Null when there's no skill to weigh.
 */
export function panelSummary(rows: readonly TrainerRecipeRow[], skill: number | null): string | null {
  if (skill === null || rows.length === 0) return null;
  const toLearn = rows.filter((r) => r.status === "can-learn" || r.status === "needs-skill");
  const known = rows.filter((r) => r.status === "known").length;
  if (toLearn.length === 0) return known > 0 ? TRAINER_PANEL_COPY.allKnown : null;
  const canLearn = toLearn.filter((r) => r.status === "can-learn").length;
  if (canLearn === toLearn.length) return TRAINER_PANEL_COPY.all(canLearn);
  return canLearn > 0 ? TRAINER_PANEL_COPY.some(canLearn, toLearn.length) : TRAINER_PANEL_COPY.none;
}
