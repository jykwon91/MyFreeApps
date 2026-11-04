import { useToast } from "@platform/mobile";
import { Linking } from "react-native";

export function useOpenLink(): (url: string) => Promise<void> {
  const { showToast } = useToast();
  return async (url) => {
    try {
      await Linking.openURL(url);
    } catch {
      showToast("I couldn't open that on this phone.", "error");
    }
  };
}
