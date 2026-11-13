import { INQUIRY_FIELD_MAX_LENGTH } from "@mybookkeeper/api-client/constants/inquiryForm";
import { useUpdateInquiryMutation } from "@mybookkeeper/api-client/store/inquiriesApi";
import { FormField, LoadingButton, useConfirmLeave, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { inquiryWriteFailure } from "./inquiryFailures";
import CollapsibleSection from "./CollapsibleSection";

export default function InquiryNotes({ id, notes, canWrite }: { id: string; notes: string | null; canWrite: boolean }) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [updateInquiry, { isLoading: isSaving }] = useUpdateInquiryMutation();
  const saved = notes ?? "";
  // null until something is typed, so a refresh can't overwrite what's being typed.
  const [edit, setEdit] = useState<string | null>(null);
  const draft = edit ?? saved;
  const isDirty = draft.trim() !== saved.trim();

  async function save(): Promise<boolean> {
    try {
      await updateInquiry({ id, data: { notes: draft.trim() || null } }).unwrap();
      setEdit(null);
      showToast("Notes saved.");
      return true;
    } catch (error) {
      showToast(inquiryWriteFailure(error, "I couldn't save those notes. Want to try again?"), "error");
      return false;
    }
  }

  useConfirmLeave(isDirty, (leave) => {
    if (isSaving) return;
    Alert.alert("Save your notes?", "I haven't saved them yet.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: leave },
      {
        text: "Save",
        onPress: async () => {
          if (await save()) leave();
        },
      },
    ]);
  });

  return (
    <CollapsibleSection preview={saved || "No notes yet."} title="Notes">
      {canWrite ? (
        <View style={{ gap: spacing.sm }}>
          <FormField label="Your notes" maxLength={INQUIRY_FIELD_MAX_LENGTH.notes} multiline onChangeText={setEdit} value={draft} />
          <LoadingButton disabled={!isDirty} isLoading={isSaving} loadingText="Saving…" onPress={() => void save()} variant="secondary">
            Save notes
          </LoadingButton>
        </View>
      ) : (
        <Text selectable style={{ fontSize: fontSize.md, color: colors.foreground }}>
          {saved || "No notes yet."}
        </Text>
      )}
    </CollapsibleSection>
  );
}
