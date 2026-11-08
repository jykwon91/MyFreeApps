import type { TalentCellState } from "@/games/wow-forever/types/talents/talentCellState";

/** The cell's ring per state (the rank counter's number says the same, so it's never colour alone). */
export const TALENT_CELL_RING: Readonly<Record<TalentCellState, string>> = {
  maxed: "border-amber-400",
  partial: "border-green-500",
  open: "border-border",
  locked: "border-border opacity-50 grayscale",
};

export const TALENT_RANK_TEXT: Readonly<Record<TalentCellState, string>> = {
  maxed: "text-amber-500",
  partial: "text-green-600",
  open: "text-foreground",
  locked: "text-muted-foreground",
};

/** Prerequisite arrows: met (green) or not yet. */
export const TALENT_ARROW_MET = "fill-green-500 stroke-green-500";
export const TALENT_ARROW_UNMET = "fill-gray-400 stroke-gray-400 dark:fill-gray-500 dark:stroke-gray-500";
