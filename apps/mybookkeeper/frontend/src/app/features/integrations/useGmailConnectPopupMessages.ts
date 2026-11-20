import { useEffect } from "react";
import type { GmailConnectMessage } from "@/shared/types/integration/gmail-connect-message";
import { readGmailConnectMessage } from "@/shared/utils/gmail-connect-message";

/** Hears how the Gmail connect popup finished. Only this site's own pages are listened to. */
export function useGmailConnectPopupMessages(onMessage: (message: GmailConnectMessage) => void): void {
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const message = readGmailConnectMessage(event.data);
      if (message) onMessage(message);
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onMessage]);
}
