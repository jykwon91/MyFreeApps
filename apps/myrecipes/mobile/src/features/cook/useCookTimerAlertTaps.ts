import { router, usePathname } from "expo-router";
import { useEffect, useRef } from "react";
import { onCookTimerAlertOpened } from "../../services/cookTimerNotifications";
import { cookHref, cookRecipeIdAt } from "../../utils/cookHref";

/**
 * Takes someone from a timer alert to the recipe it's for. Alerts show while cooking, so a
 * tap on the recipe already being cooked does nothing, and one for another recipe swaps cook
 * mode rather than stacking a second cook screen.
 */
export function useCookTimerAlertTaps(): void {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(
    () =>
      onCookTimerAlertOpened((recipeId) => {
        const cooking = cookRecipeIdAt(pathnameRef.current);
        if (cooking === recipeId) return;
        if (cooking) router.replace(cookHref(recipeId));
        else router.push(cookHref(recipeId));
      }),
    [],
  );
}
