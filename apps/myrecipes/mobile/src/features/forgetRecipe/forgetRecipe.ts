import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "../../lib/store";
import { cancelCookTimerAlert } from "../../services/cookTimerNotifications";
import { deleteCookCopy } from "../cook/cookCopies";
import { recipeForgotten } from "./recipeForgotten";

/**
 * Everything the phone keeps for a recipe that no longer exists: its Discover save, cook session,
 * timers (and their scheduled alerts) and the copy saved for cooking offline.
 */
export function forgetRecipe(recipeId: string): ThunkAction<void, RootState, undefined, UnknownAction> {
  return (dispatch, getState) => {
    const timers = getState().cookTimers.items.filter((timer) => timer.recipeId === recipeId);
    dispatch(recipeForgotten(recipeId));
    deleteCookCopy(recipeId);
    timers.forEach((timer) => void cancelCookTimerAlert(timer.id));
  };
}
