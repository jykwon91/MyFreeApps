import { setupListeners } from "@reduxjs/toolkit/query";
import { AppState } from "react-native";

/** Tells the API layer when the app comes back, which React Native can't detect on its own. */
export function refetchOnForeground(dispatch: Parameters<typeof setupListeners>[0]) {
  return setupListeners(dispatch, (send, { onFocus, onFocusLost }) => {
    const subscription = AppState.addEventListener("change", (state) => {
      send(state === "active" ? onFocus() : onFocusLost());
    });
    return () => subscription.remove();
  });
}
