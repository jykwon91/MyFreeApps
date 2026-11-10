import { useCreateSectionMutation, useUpdateSectionMutation } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import type { WelcomeManualDirtyFlags } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-dirty-flags";
import type { WelcomeManualSectionFormValues } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-form-values";
import { sectionFormCreateRequest, sectionFormUpdateRequest } from "@mybookkeeper/api-client/utils/welcomeManualRequests";
import { useLeaveWhenSaved, useToast } from "@platform/mobile";
import { WELCOME_MANUAL_SECTION_MESSAGES } from "../../constants/welcomeManualForms";
import { useWrite } from "../../lib/useWrite";
import { saveFailure } from "./welcomeManualFailure";
import { SECTION_WORDS } from "../../constants/welcomeManualSheets";

/** Adds a section, or saves what changed on one, and goes back. */
export function useSaveWelcomeManualSection(manualId: string, sectionId: string | null) {
  const { showToast } = useToast();
  const [createSection] = useCreateSectionMutation();
  const [updateSection] = useUpdateSectionMutation();
  const write = useWrite();
  const { isLeaving, leave } = useLeaveWhenSaved(`/welcome-manuals/${manualId}/sections`);

  async function submit(values: WelcomeManualSectionFormValues, dirty: WelcomeManualDirtyFlags<WelcomeManualSectionFormValues>): Promise<void> {
    if (sectionId !== null && Object.keys(dirty).length === 0) {
      leave();
      return;
    }
    const result = await write.run(
      () =>
        sectionId === null
          ? createSection({ manualId, data: sectionFormCreateRequest(values) }).unwrap()
          : updateSection({ manualId, sectionId, data: sectionFormUpdateRequest(values, dirty) }).unwrap(),
      { staysLocked: true },
    );
    if (result !== "done") return;
    showToast(sectionId === null ? WELCOME_MANUAL_SECTION_MESSAGES.added : WELCOME_MANUAL_SECTION_MESSAGES.saved);
    leave();
  }

  return { submit, isBusy: write.isBusy, isLeaving, failure: write.error ? saveFailure(write.error, SECTION_WORDS, sectionId === null) : null };
}
