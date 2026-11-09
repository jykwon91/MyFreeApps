import { useUpdateGmailLabelMutation } from "@mybookkeeper/api-client/store/integrationsApi";
import { FormField, FormSheet, LoadingButton, useToast } from "@platform/mobile";
import { useState } from "react";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../../constants/integrations";
import { confirmDiscard } from "../../lib/confirmDiscard";
import { useWrite } from "../../lib/useWrite";
import { actionFailureCopy } from "../../lib/writeFailureCopy";

const COPY = actionFailureCopy("save the label", { invalid: "Gmail didn't accept that label. Check the name and try again." });

interface GmailLabelSheetProps {
  /** The label saved now; empty means all email. */
  saved: string;
  onClose: () => void;
}

/** Limits syncing to one Gmail label. Saving it empty clears the limit. */
export default function GmailLabelSheet({ saved, onClose }: GmailLabelSheetProps) {
  const { showToast } = useToast();
  const [updateLabel] = useUpdateGmailLabelMutation();
  const write = useWrite();
  const [text, setText] = useState(saved);
  const label = text.trim();
  const isDirty = label !== saved;

  function close(): void {
    if (write.isBusy) return;
    if (isDirty) confirmDiscard(onClose);
    else onClose();
  }

  async function save(): Promise<void> {
    const result = await write.run(() => updateLabel({ label }).unwrap());
    if (result !== "done") return;
    onClose();
    showToast(MESSAGES.labelSaved(label));
  }

  return (
    <FormSheet failure={write.failure ? COPY[write.failure] : null} isOpen onRequestClose={close} title={MESSAGES.labelSheetTitle}>
      <FormField
        autoCapitalize="none"
        editable={!write.isBusy}
        hint={MESSAGES.labelEmptyHint}
        label={MESSAGES.labelHeading}
        onChangeText={setText}
        placeholder={MESSAGES.labelPlaceholder}
        value={text}
      />
      <LoadingButton disabled={!isDirty} isLoading={write.isBusy} loadingText={MESSAGES.labelSaving} onPress={() => void save()}>
        {MESSAGES.labelSave}
      </LoadingButton>
      <LoadingButton disabled={write.isBusy} onPress={close} variant="ghost">
        {MESSAGES.labelCancel}
      </LoadingButton>
    </FormSheet>
  );
}
