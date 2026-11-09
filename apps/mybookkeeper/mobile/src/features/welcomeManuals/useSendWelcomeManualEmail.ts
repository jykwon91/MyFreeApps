import { useEmailWelcomeManualMutation } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import type { WelcomeManualEmailFormValues } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-email-form-values";
import type { WelcomeManualSendResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-send-response";
import { emailRequest } from "@mybookkeeper/api-client/utils/welcomeManualRequests";
import { useState } from "react";
import { useWrite } from "../../lib/useWrite";
import { emailFailure } from "./welcomeManualFailure";

/** Sends the guide once and keeps what the server said happened, since a refused send still answers 200. */
export function useSendWelcomeManualEmail(manualId: string) {
  const [emailManual] = useEmailWelcomeManualMutation();
  const write = useWrite();
  const [outcome, setOutcome] = useState<WelcomeManualSendResponse | null>(null);

  async function send(values: WelcomeManualEmailFormValues): Promise<void> {
    await write.run(async () => {
      setOutcome(await emailManual({ manualId, data: emailRequest(values) }).unwrap());
    });
  }

  return { send, outcome, reset: () => setOutcome(null), isBusy: write.isBusy, failure: write.error ? emailFailure(write.error) : null };
}
