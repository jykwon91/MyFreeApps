import { useEffect, useState } from "react";
import { AppState } from "react-native";

/** True while the app is the one on screen; false in the background or the app switcher. */
export function useAppInForeground(): boolean {
  const [isForeground, setIsForeground] = useState(() => AppState.currentState === "active");

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setIsForeground(state === "active"));
    return () => subscription.remove();
  }, []);

  return isForeground;
}
