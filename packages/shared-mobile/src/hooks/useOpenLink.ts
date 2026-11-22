import { useCallback } from "react";
import { Linking } from "react-native";
import { LINK_MESSAGES } from "../constants/links";
import { useToast } from "./useToast";

/** Opens a link in the browser or the app that handles it, saying so if the phone can't. Stable across renders. */
export function useOpenLink(): (url: string) => Promise<void> {
  const { showToast } = useToast();
  return useCallback(
    async (url: string) => {
      try {
        await Linking.openURL(url);
      } catch {
        showToast(LINK_MESSAGES.couldntOpen, "error");
      }
    },
    [showToast],
  );
}
