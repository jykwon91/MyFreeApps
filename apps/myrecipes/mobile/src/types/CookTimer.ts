import type { CookTimerAlert } from "./CookTimerAlert";

export type CookTimer = {
  /** Also the id of its scheduled notification. */
  id: string;
  recipeId: string;
  recipeTitle: string;
  stepNumber: number;
  seconds: number;
  endsAt: number;
  alert: CookTimerAlert;
};
