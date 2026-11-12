import { useEffect } from "react";
import { AppState } from "react-native";

/** Calls `onResume` once the app has been back from the background for `delayMs`, unless it leaves again first. */
export function useOnResume(onResume: () => void, delayMs: number): void {
  useEffect(() => {
    let wasAway = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = AppState.addEventListener("change", (state) => {
      clearTimeout(timer);
      if (state === "background") wasAway = true;
      if (state === "active" && wasAway) {
        wasAway = false;
        timer = setTimeout(onResume, delayMs);
      }
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [onResume, delayMs]);
}
