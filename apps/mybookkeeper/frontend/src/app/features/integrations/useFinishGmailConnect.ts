import { useCompleteGmailConnectMutation } from "@mybookkeeper/api-client/store/integrationsApi";
import { gmailConnectRefusalReason, readGmailConnectReturn } from "@mybookkeeper/api-client/utils/gmailConnectReturn";
import { useEffect, useRef, useState } from "react";
import type { GmailConnectFinish } from "@/shared/types/integration/gmail-connect-finish";

/** Google's answer from the fragment, taken out of the address bar and history once read. */
function readAndClearGoogleAnswer() {
  const answer = readGmailConnectReturn(new URLSearchParams(window.location.hash.slice(1)));
  window.history.replaceState(null, "", window.location.pathname);
  return answer;
}

/**
 * Finishes the Gmail connection Google's answer came back to this page for, signed in, so the
 * server only connects it for the person who started it.
 */
export function useFinishGmailConnect(): GmailConnectFinish {
  const [completeGmailConnect] = useCompleteGmailConnectMutation();
  const [answer] = useState(readAndClearGoogleAnswer);
  const [finish, setFinish] = useState<GmailConnectFinish>(answer.kind === "failed" ? answer : { kind: "connecting" });
  // Google's code works once, so running again (as StrictMode does) must not send it again.
  const sent = useRef(false);

  useEffect(() => {
    if (answer.kind !== "authorized" || sent.current) return;
    sent.current = true;
    completeGmailConnect({ code: answer.code, state: answer.state })
      .unwrap()
      .then(
        () => setFinish({ kind: "connected" }),
        (refusal: unknown) => setFinish({ kind: "failed", reason: gmailConnectRefusalReason(refusal) }),
      );
  }, [answer, completeGmailConnect]);

  return finish;
}
