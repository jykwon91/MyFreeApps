import { Linking } from "react-native";
import { LINK_MESSAGES } from "../constants/links";
import { useToast } from "./useToast";

/** Opens a link in the browser or the app that handles it, saying so if the phone can't. */
export function useOpenLink(): (url: string) => Promise<void> {
  const { showToast } = useToast();
  return async (url) => {
    try {
      await Linking.openURL(url);
    } catch {
      showToast(LINK_MESSAGES.couldntOpen, "error");
    }
  };
}
