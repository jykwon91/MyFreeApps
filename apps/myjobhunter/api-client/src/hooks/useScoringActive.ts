import { useEffect } from "react";
import type { ScoringWindow } from "../types/discovery/scoring-window";

/**
 * Feeds the inbox's unscored count to the scoring window and says whether scores are still
 * expected: the window is open and something is left to score. Derived in render, so the cards
 * stop showing "Scoring" the moment the last score lands, before the window's own close.
 */
export function useScoringActive(scoringWindow: ScoringWindow, unscored: number | null): boolean {
  const { observe } = scoringWindow;
  useEffect(() => observe(unscored), [observe, unscored]);
  return scoringWindow.isOpen && unscored !== 0;
}
