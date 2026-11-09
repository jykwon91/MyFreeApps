import { useToast } from "@platform/mobile";
import * as Clipboard from "expo-clipboard";

/** Puts text on the clipboard and says so, or says it couldn't. */
export function useCopyText(): (text: string, copiedMessage: string, failedMessage: string) => Promise<void> {
  const { showToast } = useToast();
  return async (text, copiedMessage, failedMessage) => {
    try {
      await Clipboard.setStringAsync(text);
      showToast(copiedMessage);
    } catch {
      showToast(failedMessage, "error");
    }
  };
}
