import { useEnableWelcomeManualShareMutation, useRevokeWelcomeManualShareMutation, useUpdateWelcomeManualShareMutation } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import { useToast } from "@platform/mobile";
import { useState } from "react";
import { WELCOME_MANUAL_SHARE_MESSAGES as MESSAGES } from "../../constants/welcomeManualForms";
import { useWrite } from "../../lib/useWrite";
import { shareFailure } from "./welcomeManualFailure";

type Doing = "turn on sharing" | "make a new code" | "stop sharing";

/** Turning a manual's share link on and off, and making a new code. Each is one request, never retried by itself. */
export function useWelcomeManualShare(manualId: string) {
  const { showToast } = useToast();
  const [enableShare] = useEnableWelcomeManualShareMutation();
  const [updateShare] = useUpdateWelcomeManualShareMutation();
  const [revokeShare] = useRevokeWelcomeManualShareMutation();
  const write = useWrite();
  const [doing, setDoing] = useState<Doing>("turn on sharing");

  async function run(what: Doing, action: () => Promise<unknown>, done: string): Promise<void> {
    setDoing(what);
    if ((await write.run(action)) === "done") showToast(done);
  }

  return {
    enable: () => run("turn on sharing", () => enableShare(manualId).unwrap(), MESSAGES.enabled),
    newCode: () => run("make a new code", () => updateShare({ manualId, data: {} }).unwrap(), MESSAGES.newCodeMade),
    revoke: () => run("stop sharing", () => revokeShare(manualId).unwrap(), MESSAGES.revoked),
    isBusy: write.isBusy,
    doing: write.isBusy ? doing : null,
    failure: write.error ? shareFailure(write.error, doing) : null,
  };
}
