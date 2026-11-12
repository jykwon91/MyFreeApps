import { useEffect } from "react";
import { AppState } from "react-native";

/** Calls `onBackground` when the app leaves the screen for the home screen or another app. */
export function useOnBackground(onBackground: () => void): void {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") onBackground();
    });
    return () => subscription.remove();
  }, [onBackground]);
}
