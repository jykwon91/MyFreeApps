import { useUploadScreeningResultMutation } from "@mybookkeeper/api-client/store/screeningApi";
import { ADVERSE_OUTCOMES, SCREENING_UPLOAD_OUTCOMES } from "@mybookkeeper/api-client/constants/screeningStatus";
import type { ScreeningStatus } from "@mybookkeeper/api-client/types/applicant/screening-status";
import { Banner, FormField, LoadingButton, OptionRow, useTheme, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from "react-native";
import { SCREENING_MESSAGES, SCREENING_PHOTO_NAME, SCREENING_REASON_MAX_LENGTH, SCREENING_REPORT_FILE_TYPES } from "../../constants/applicantScreening";
import { filePart } from "../../lib/filePart";
import { screeningOutcomeLabel } from "./applicantDisplay";
import { confirmDiscard } from "../uploads/confirmDiscard";
import HeldFileButtons from "../uploads/HeldFileButtons";
import { useHeldFile } from "../uploads/useHeldFile";
import { screeningUploadFailure } from "./screeningUploadFailure";

export default function ScreeningUploadSheet({ applicantId, isOpen, onClose }: { applicantId: string; isOpen: boolean; onClose: () => void }) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [upload, { isLoading: isUploading }] = useUploadScreeningResultMutation();
  const [outcome, setOutcome] = useState<ScreeningStatus | null>(null);
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const isSubmitting = useRef(false);
  const { file, isPicking, pick, forget: forgetFile } = useHeldFile(setFailure);

  const needsReason = outcome !== null && ADVERSE_OUTCOMES.includes(outcome);
  const isReady = file !== null && outcome !== null && (!needsReason || reason.trim().length > 0);

  function forget(): void {
    forgetFile();
    setOutcome(null);
    setReason("");
    setFailure(null);
  }

  function close(): void {
    if (isUploading || isPicking) return;
    if (!file && !outcome && !reason) {
      setFailure(null);
      onClose();
      return;
    }
    confirmDiscard(() => {
      forget();
      onClose();
    });
  }

  async function submit(): Promise<void> {
    if (!file || !outcome || isPicking || isSubmitting.current) return;
    isSubmitting.current = true;
    setFailure(null);
    const form = new FormData();
    form.append("file", filePart(file));
    form.append("status", outcome);
    if (needsReason) form.append("adverse_action_snippet", reason.trim());
    try {
      await upload({ applicantId, form }).unwrap();
      forget();
      onClose();
      showToast(SCREENING_MESSAGES.uploaded);
    } catch (error) {
      setFailure(screeningUploadFailure(error));
    } finally {
      isSubmitting.current = false;
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet" visible={isOpen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {SCREENING_MESSAGES.sheetTitle}
          </Text>
          {failure ? <Banner message={failure} /> : null}

          <HeldFileButtons
            file={file}
            fileTypes={SCREENING_REPORT_FILE_TYPES}
            isDisabled={isUploading}
            isPicking={isPicking}
            onPick={(from) => void pick(from)}
            photoName={SCREENING_PHOTO_NAME}
            takePhotoLabel={SCREENING_MESSAGES.takePhoto}
          />

          <View accessibilityLabel={SCREENING_MESSAGES.outcome} accessibilityRole="radiogroup" style={{ gap: spacing.xs }}>
            <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{SCREENING_MESSAGES.outcome}</Text>
            {SCREENING_UPLOAD_OUTCOMES.map((choice) => (
              <OptionRow
                isSelected={outcome === choice}
                key={choice}
                label={screeningOutcomeLabel(choice)}
                onPress={() => {
                  if (!isUploading) setOutcome(choice);
                }}
              />
            ))}
          </View>

          {needsReason ? (
            <FormField
              editable={!isUploading}
              hint={`${SCREENING_MESSAGES.reasonHint} ${reason.length}/${SCREENING_REASON_MAX_LENGTH}`}
              inputStyle={{ minHeight: 96, textAlignVertical: "top" }}
              label={SCREENING_MESSAGES.reason}
              maxLength={SCREENING_REASON_MAX_LENGTH}
              multiline
              onChangeText={setReason}
              value={reason}
            />
          ) : null}

          <LoadingButton disabled={!isReady || isPicking} isLoading={isUploading} loadingText={SCREENING_MESSAGES.saving} onPress={() => void submit()}>
            {SCREENING_MESSAGES.save}
          </LoadingButton>
          <LoadingButton disabled={isUploading || isPicking} onPress={close} variant="ghost">
            {SCREENING_MESSAGES.cancel}
          </LoadingButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
