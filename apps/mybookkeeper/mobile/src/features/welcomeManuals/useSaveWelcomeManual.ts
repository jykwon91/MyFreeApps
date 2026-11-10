import { useCreateWelcomeManualMutation, useUpdateWelcomeManualMutation } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import type { WelcomeManualCreateFormValues } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-create-form-values";
import type { WelcomeManualDirtyFlags } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-dirty-flags";
import type { WelcomeManualFormValues } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-form-values";
import { manualCreateRequest, manualUpdateRequest } from "@mybookkeeper/api-client/utils/welcomeManualRequests";
import { useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { WELCOME_MANUAL_FORM_MESSAGES } from "../../constants/welcomeManualForms";
import { useLeaveWhenSaved } from "../../lib/useLeaveWhenSaved";
import { useWrite } from "../../lib/useWrite";
import { saveFailure } from "./welcomeManualFailure";
import { MANUAL_WORDS } from "../../constants/welcomeManualSheets";

/** Makes a manual and opens it, or saves what changed on one and goes back. */
export function useSaveWelcomeManual(manualId: string | null) {
  const { showToast } = useToast();
  const [createManual] = useCreateWelcomeManualMutation();
  const [updateManual] = useUpdateWelcomeManualMutation();
  const write = useWrite();
  const { isLeaving, leave } = useLeaveWhenSaved("/welcome-manuals");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const failure = write.error ? saveFailure(write.error, MANUAL_WORDS, manualId === null) : null;

  // The new manual replaces this form, so Back returns to the list rather than to a blank form. It
  // waits a render so the discard question no longer sees the typed text.
  useEffect(() => {
    if (createdId !== null) router.replace(`/welcome-manuals/${createdId}`);
  }, [createdId]);

  async function create(values: WelcomeManualCreateFormValues): Promise<void> {
    let made = "";
    const result = await write.run(async () => {
      made = (await createManual(manualCreateRequest(values)).unwrap()).id;
    }, { staysLocked: true });
    if (result !== "done") return;
    showToast(WELCOME_MANUAL_FORM_MESSAGES.created);
    setCreatedId(made);
  }

  async function update(values: WelcomeManualFormValues, dirty: WelcomeManualDirtyFlags<WelcomeManualFormValues>): Promise<void> {
    if (manualId === null) return;
    if (Object.keys(dirty).length === 0) {
      leave();
      return;
    }
    const result = await write.run(() => updateManual({ id: manualId, data: manualUpdateRequest(values, dirty) }).unwrap(), { staysLocked: true });
    if (result !== "done") return;
    showToast(WELCOME_MANUAL_FORM_MESSAGES.saved);
    leave();
  }

  return { create, update, isBusy: write.isBusy, isLeaving: isLeaving || createdId !== null, failure };
}
