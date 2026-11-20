import { GMAIL_CONNECT_FAILURE_MESSAGES } from "@mybookkeeper/api-client/constants/gmailConnect";
import { useEffect } from "react";
import { useFinishGmailConnect } from "@/app/features/integrations/useFinishGmailConnect";
import { GMAIL_CONNECT_POPUP_COPY } from "@/shared/lib/gmail-connect-messages";
import { gmailConnectMessageFor } from "@/shared/utils/gmail-connect-message";

export default function OAuthCallback() {
  const finish = useFinishGmailConnect();

  useEffect(() => {
    const message = gmailConnectMessageFor(finish);
    if (!message || !window.opener) return;
    window.opener.postMessage(message, window.location.origin);
    window.close();
  }, [finish]);

  if (finish.kind === "failed") {
    return (
      <div role="alert" className="p-8 text-center text-sm text-red-600 dark:text-red-400">
        {GMAIL_CONNECT_FAILURE_MESSAGES[finish.reason]}
      </div>
    );
  }
  return (
    <div role="status" className="p-8 text-center text-muted-foreground text-sm">
      {finish.kind === "connected" ? GMAIL_CONNECT_POPUP_COPY.connected : GMAIL_CONNECT_POPUP_COPY.connecting}
    </div>
  );
}
