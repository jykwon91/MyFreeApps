import { useUpdateSignedLeaseMutation } from "@mybookkeeper/api-client/store/signedLeasesApi";
import { FormField, FormSheet, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { LEASE_DETAIL_MESSAGES as MESSAGES } from "../../constants/leaseDetails";
import { useWrite } from "../../lib/useWrite";
import { saveFailureCopy } from "../../lib/writeFailureCopy";
import { confirmDiscard } from "../uploads/confirmDiscard";

const NOTES_MIN_HEIGHT = 144;
const COPY = saveFailureCopy("lease", "leases", false);

interface LeaseNotesSheetProps {
  leaseId: string;
  /** What's saved now. */
  notes: string;
  onClose: () => void;
}

export default function LeaseNotesSheet({ leaseId, notes, onClose }: LeaseNotesSheetProps) {
  const { spacing } = useTheme();
  const { showToast } = useToast();
  const [updateLease] = useUpdateSignedLeaseMutation();
  const write = useWrite();
  const [text, setText] = useState(notes);
  const isDirty = text.trim() !== notes.trim();

  function close(): void {
    if (write.isBusy) return;
    if (isDirty) confirmDiscard(onClose);
    else onClose();
  }

  async function save(): Promise<void> {
    if (!isDirty) {
      onClose();
      return;
    }
    const result = await write.run(() => updateLease({ leaseId, data: { notes: text.trim() } }).unwrap());
    if (result !== "done") return;
    onClose();
    showToast(MESSAGES.notesSaved);
  }

  return (
    <FormSheet failure={write.failure ? COPY[write.failure] : null} isOpen onRequestClose={close} title={MESSAGES.notesTitle}>
      <FormField
        editable={!write.isBusy}
        inputStyle={{ minHeight: NOTES_MIN_HEIGHT, paddingTop: spacing.md, textAlignVertical: "top" }}
        label={MESSAGES.notesLabel}
        multiline
        onChangeText={setText}
        placeholder={MESSAGES.notesPlaceholder}
        value={text}
      />
      <LoadingButton isLoading={write.isBusy} loadingText={MESSAGES.savingNotes} onPress={() => void save()}>
        {MESSAGES.saveNotes}
      </LoadingButton>
      <LoadingButton disabled={write.isBusy} onPress={close} variant="ghost">
        {MESSAGES.cancelNotes}
      </LoadingButton>
    </FormSheet>
  );
}
