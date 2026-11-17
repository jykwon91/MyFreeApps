import { useUpdateSignedLeaseMutation } from "@mybookkeeper/api-client/store/signedLeasesApi";
import { FormField, FormSheet, FormSheetCancelButton, LoadingButton, useToast } from "@platform/mobile";
import { useState } from "react";
import { LEASE_DETAIL_MESSAGES as MESSAGES } from "../../constants/leaseDetails";
import { useWrite } from "../../lib/useWrite";
import { saveFailureCopy } from "../../lib/writeFailureCopy";

const NOTES_MIN_HEIGHT = 144;
const COPY = saveFailureCopy("lease", "leases", false);

interface LeaseNotesSheetProps {
  leaseId: string;
  /** What's saved now. */
  notes: string;
  onClose: () => void;
}

export default function LeaseNotesSheet({ leaseId, notes, onClose }: LeaseNotesSheetProps) {
  const { showToast } = useToast();
  const [updateLease] = useUpdateSignedLeaseMutation();
  const write = useWrite();
  const [text, setText] = useState(notes);
  const isDirty = text.trim() !== notes.trim();

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
    <FormSheet failure={write.failure ? COPY[write.failure] : null} hasUnsavedChanges={isDirty} isBusy={write.isBusy} isOpen onRequestClose={onClose} title={MESSAGES.notesTitle}>
      <FormField
        editable={!write.isBusy}
        inputStyle={{ minHeight: NOTES_MIN_HEIGHT }}
        label={MESSAGES.notesLabel}
        multiline
        onChangeText={setText}
        placeholder={MESSAGES.notesPlaceholder}
        value={text}
      />
      <LoadingButton isLoading={write.isBusy} loadingText={MESSAGES.savingNotes} onPress={() => void save()}>
        {MESSAGES.saveNotes}
      </LoadingButton>
      <FormSheetCancelButton>
        {MESSAGES.cancelNotes}
      </FormSheetCancelButton>
    </FormSheet>
  );
}
