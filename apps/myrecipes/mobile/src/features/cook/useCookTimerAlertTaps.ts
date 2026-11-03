import { router } from "expo-router";
import { useEffect } from "react";
import { onCookTimerAlertOpened } from "../../services/cookTimerNotifications";

/** Takes someone from a timer alert to the recipe it's for. */
export function useCookTimerAlertTaps(): void {
  useEffect(
    () =>
      onCookTimerAlertOpened((recipeId) => {
        router.push({ pathname: "/recipes/[id]/cook", params: { id: recipeId } });
      }),
    [],
  );
}
