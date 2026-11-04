import { APPLICANT_STAGE_NOTE_MAX_LENGTH } from "@mybookkeeper/api-client/constants/applicantStageNote";
import type { ApplicantStage } from "@mybookkeeper/api-client/types/applicant/applicant-stage";
import { Banner, FormField, LoadingButton, useTheme } from "@platform/mobile";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text } from "react-native";
import { applicantStageLabel } from "./applicantDisplay";

export default function ApplicantStageSheet({
  isOpen,
  name,
  onClose,
  onMove,
  stage,
}: {
  isOpen: boolean;
  name: string;
  onClose: () => void;
  onMove: (stage: ApplicantStage, note: string) => Promise<string | null>;
  stage: ApplicantStage | null;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const [note, setNote] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  // Covers the re-read after a failure too, when a second tap could otherwise slip in.
  const [isMoving, setIsMoving] = useState(false);
  const isSubmitting = useRef(false);

  function close(): void {
    if (isMoving) return;
    setNote("");
    setFailure(null);
    onClose();
  }

  async function submit(target: ApplicantStage): Promise<void> {
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setIsMoving(true);
    setFailure(null);
    const problem = await onMove(target, note);
    isSubmitting.current = false;
    setIsMoving(false);
    if (problem) {
      setFailure(problem);
      return;
    }
    setNote("");
    onClose();
  }

  return (
    <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet" visible={isOpen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
        {stage ? (
          <ScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
              {`Move to ${applicantStageLabel(stage)}?`}
            </Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{name}</Text>
            {failure ? <Banner message={failure} /> : null}
            <FormField
              editable={!isMoving}
              hint={`${note.length}/${APPLICANT_STAGE_NOTE_MAX_LENGTH}`}
              inputStyle={{ minHeight: 96, textAlignVertical: "top" }}
              label="Note (optional)"
              maxLength={APPLICANT_STAGE_NOTE_MAX_LENGTH}
              multiline
              onChangeText={setNote}
              value={note}
            />
            <LoadingButton isLoading={isMoving} loadingText="Moving…" onPress={() => void submit(stage)}>
              {`Move to ${applicantStageLabel(stage)}`}
            </LoadingButton>
            <LoadingButton disabled={isMoving} onPress={close} variant="ghost">
              Cancel
            </LoadingButton>
          </ScrollView>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}
