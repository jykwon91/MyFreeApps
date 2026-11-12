import { APPLICATION_NOTES_MAX_LENGTH } from "@myjobhunter/api-client/constants/textFieldLimits";
import { useUpdateApplicationMutation } from "@myjobhunter/api-client/store/applicationsApi";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import { FormField, LoadingButton, useConfirmLeave, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Alert, View } from "react-native";
import { APPLICATION_NOTES_MESSAGES as MESSAGES } from "../../constants/applicationNotes";
import { writeFailure } from "../../lib/writeFailure";
import type { NotesSectionProps } from "../../types/NotesSectionProps";
import SectionHeading from "./SectionHeading";

/** Notes save when Save is pressed, and leaving with unsaved notes asks first. */
export default function NotesSection({ applicationId, notes, isLeaving }: NotesSectionProps) {
  const { spacing } = useTheme();
  const { showToast } = useToast();
  const [updateApplication, { isLoading: isSaving }] = useUpdateApplicationMutation();
  const serverNotes = notes ?? "";
  const [draft, setDraft] = useState(serverNotes);
  // What the server holds as far as this screen knows: it changes on a save before the refetch lands.
  const [savedNotes, setSavedNotes] = useState(serverNotes);
  const [lastServerNotes, setLastServerNotes] = useState(serverNotes);
  const isDirty = draft !== savedNotes;
  const draftError = tooLongProblem(draft, APPLICATION_NOTES_MAX_LENGTH);

  // A refresh brings in notes saved elsewhere, but never over what's being typed.
  if (serverNotes !== lastServerNotes) {
    setLastServerNotes(serverNotes);
    setSavedNotes(serverNotes);
    if (!isDirty) setDraft(serverNotes);
  }

  async function save(): Promise<boolean> {
    if (draftError) {
      showToast(draftError, "error");
      return false;
    }
    const next = draft;
    try {
      await updateApplication({ id: applicationId, patch: { notes: next } }).unwrap();
      setSavedNotes(next);
      showToast(MESSAGES.saved);
      return true;
    } catch (error) {
      showToast(writeFailure(error, MESSAGES.couldntSave), "error");
      return false;
    }
  }

  // A delete takes the notes with it, so it shouldn't stop to ask about them.
  useConfirmLeave(isDirty && !isLeaving, (leave) => {
    if (isSaving) return;
    Alert.alert(MESSAGES.leaveTitle, MESSAGES.leaveBody, [
      { text: MESSAGES.keepEditing, style: "cancel" },
      { text: MESSAGES.discard, style: "destructive", onPress: leave },
      {
        text: MESSAGES.save,
        onPress: async () => {
          if (await save()) leave();
        },
      },
    ]);
  });

  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeading title={MESSAGES.title} />
      <FormField
        editable={!isSaving && !isLeaving}
        counter={characterCounter(draft, APPLICATION_NOTES_MAX_LENGTH)}
        error={draftError}
        label={MESSAGES.label}
        multiline
        onChangeText={setDraft}
        placeholder={MESSAGES.placeholder}
        value={draft}
      />
      <LoadingButton
        disabled={!isDirty || isLeaving || draftError !== undefined}
        isLoading={isSaving}
        loadingText={MESSAGES.saving}
        onPress={async () => {
          await save();
        }}
        variant="secondary"
      >
        {MESSAGES.save}
      </LoadingButton>
    </View>
  );
}
