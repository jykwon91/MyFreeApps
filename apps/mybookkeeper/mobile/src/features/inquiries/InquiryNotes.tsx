import { useUpdateInquiryMutation } from "@mybookkeeper/api-client/store/inquiriesApi";
import { FormField, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useNavigation, usePreventRemove } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { INQUIRY_NOTES_MAX_LENGTH } from "../../constants/inquiries";
import { inquiryWriteFailure } from "./inquiryFailures";
import CollapsibleSection from "./CollapsibleSection";

export default function InquiryNotes({ id, notes, canWrite }: { id: string; notes: string | null; canWrite: boolean }) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const navigation = useNavigation();
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

  usePreventRemove(isDirty, ({ data }) => {
    Alert.alert("Save your notes?", "I haven't saved them yet.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(data.action) },
      {
        text: "Save",
        onPress: async () => {
          if (await save()) navigation.dispatch(data.action);
        },
      },
    ]);
  });

  return (
    <CollapsibleSection preview={saved || "No notes yet."} title="Notes">
      {canWrite ? (
        <View style={{ gap: spacing.sm }}>
          <FormField label="Your notes" maxLength={INQUIRY_NOTES_MAX_LENGTH} multiline onChangeText={setEdit} value={draft} />
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
