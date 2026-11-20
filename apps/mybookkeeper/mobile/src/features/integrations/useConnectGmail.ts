import { GMAIL_CONNECT_FAILURE_MESSAGES } from "@mybookkeeper/api-client/constants/gmailConnect";
import { integrationsApi, useCompleteGmailConnectMutation, useConnectGmailMutation } from "@mybookkeeper/api-client/store/integrationsApi";
import { gmailConnectRefusalReason } from "@mybookkeeper/api-client/utils/gmailConnectReturn";
import { useToast } from "@platform/mobile";
import { openAuthSessionAsync } from "expo-web-browser";
import { useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { GMAIL_CONNECT_MESSAGES as MESSAGES, GMAIL_CONNECT_RETURN_URL, GMAIL_CONNECTED_TAGS } from "../../constants/gmailConnect";
import type { AppDispatch } from "../../lib/store";
import { useWrite } from "../../lib/useWrite";
import { actionFailureCopy } from "../../lib/writeFailureCopy";
import type { IntegrationAction } from "../../types/IntegrationAction";
import { gmailConnectOutcome } from "./gmailConnectOutcome";

const START_COPY = actionFailureCopy("start connecting Gmail", "safe", { noResponse: MESSAGES.couldntReach, serverError: MESSAGES.couldntReach });

/**
 * Connects or reconnects Gmail in Google's sign-in, which comes back to the app with Google's
 * answer for the app to finish, signed in. Busy from the tap until it's finished.
 */
export function useConnectGmail(): IntegrationAction {
  const dispatch = useDispatch<AppDispatch>();
  const { showToast } = useToast();
  const [connectGmail] = useConnectGmailMutation();
  const [completeGmailConnect] = useCompleteGmailConnectMutation();
  const start = useWrite();
  const isSigningIn = useRef(false);
  const [isInBrowser, setIsInBrowser] = useState(false);

  async function signIn(authUrl: string): Promise<void> {
    isSigningIn.current = true;
    setIsInBrowser(true);
    try {
      const outcome = gmailConnectOutcome(await openAuthSessionAsync(authUrl, GMAIL_CONNECT_RETURN_URL));
      // Closing the browser is the person changing their mind, which needs no answer.
      if (outcome.kind === "closed") return;
      if (outcome.kind === "failed") {
        showToast(GMAIL_CONNECT_FAILURE_MESSAGES[outcome.reason], "error");
        return;
      }
      try {
        await completeGmailConnect({ code: outcome.code, state: outcome.state }).unwrap();
      } catch (refusal) {
        showToast(GMAIL_CONNECT_FAILURE_MESSAGES[gmailConnectRefusalReason(refusal)], "error");
        return;
      }
      dispatch(integrationsApi.util.invalidateTags(GMAIL_CONNECTED_TAGS));
      showToast(MESSAGES.connected);
    } catch (error) {
      console.error("Couldn't open Google's sign-in", error);
      showToast(MESSAGES.couldntOpen, "error");
    } finally {
      isSigningIn.current = false;
      setIsInBrowser(false);
    }
  }

  return {
    isBusy: start.isBusy || isInBrowser,
    run: async () => {
      if (isSigningIn.current) return;
      let authUrl = "";
      const result = await start.run(async () => {
        authUrl = (await connectGmail("mobile").unwrap()).auth_url;
      });
      if (result === "busy" || result === "cancelled") return;
      if (result !== "done") {
        showToast(START_COPY[result], "error");
        return;
      }
      await signIn(authUrl);
    },
  };
}
