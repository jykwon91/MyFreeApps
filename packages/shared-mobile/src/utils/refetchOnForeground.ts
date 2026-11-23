import NetInfo from "@react-native-community/netinfo";
import { setupListeners } from "@reduxjs/toolkit/query";
import { AppState } from "react-native";

/**
 * Tells the API layer when the app comes back and when the network does, which React Native can't
 * detect on its own. The network's first report is only the starting state, so it tells nothing.
 */
export function refetchOnForeground(dispatch: Parameters<typeof setupListeners>[0]) {
  return setupListeners(dispatch, (send, { onFocus, onFocusLost, onOnline, onOffline }) => {
    const subscription = AppState.addEventListener("change", (state) => {
      send(state === "active" ? onFocus() : onFocusLost());
    });
    let wasOnline: boolean | null = null;
    const unsubscribeNetwork = NetInfo.addEventListener(({ isConnected }) => {
      if (isConnected === null) return;
      if (wasOnline !== null && isConnected !== wasOnline) send(isConnected ? onOnline() : onOffline());
      wasOnline = isConnected;
    });
    return () => {
      subscription.remove();
      unsubscribeNetwork();
    };
  });
}
