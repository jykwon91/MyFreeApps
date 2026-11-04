import { useUploadScreeningResultMutation } from "@mybookkeeper/api-client/store/screeningApi";
import { ADVERSE_OUTCOMES, SCREENING_UPLOAD_OUTCOMES } from "@mybookkeeper/api-client/constants/screeningStatus";
import type { ScreeningStatus } from "@mybookkeeper/api-client/types/applicant/screening-status";
import { Banner, FormField, LoadingButton, OptionRow, useTheme, useToast } from "@platform/mobile";
import { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from "react-native";
import { SCREENING_MESSAGES, SCREENING_REASON_MAX_LENGTH } from "../../constants/applicantScreening";
import { filePart } from "../../lib/filePart";
import type { FileForUpload } from "../../types/FileForUpload";
import { screeningOutcomeLabel } from "./applicantDisplay";
import { discardFile } from "../capture/uploadQueueFiles";
import { chooseReportFile, chooseReportPhoto, takeReportPhoto } from "./pickScreeningReport";
import { clearHeldReports } from "./screeningReportFile";
import { screeningUploadFailure } from "./screeningUploadFailure";

export default function ScreeningUploadSheet({ applicantId, isOpen, onClose }: { applicantId: string; isOpen: boolean; onClose: () => void }) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [upload, { isLoading: isUploading }] = useUploadScreeningResultMutation();
  const [file, setFile] = useState<FileForUpload | null>(null);
  const [outcome, setOutcome] = useState<ScreeningStatus | null>(null);
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const isSubmitting = useRef(false);
  const [isPicking, setIsPicking] = useState(false);
  const isMounted = useRef(true);

  // Losing write access or leaving the page can take the sheet away with a report still held.
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      clearHeldReports();
    };
  }, []);

  const needsReason = outcome !== null && ADVERSE_OUTCOMES.includes(outcome);
  const isReady = file !== null && outcome !== null && (!needsReason || reason.trim().length > 0);

  function forget(): void {
    clearHeldReports();
    setFile(null);
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
    Alert.alert(SCREENING_MESSAGES.discardTitle, undefined, [
      { text: SCREENING_MESSAGES.keepEditing, style: "cancel" },
      {
        text: SCREENING_MESSAGES.discard,
        style: "destructive",
        onPress: () => {
          forget();
          onClose();
        },
      },
    ]);
  }

  async function pick(from: () => Promise<FileForUpload | "denied" | null>): Promise<void> {
    setFailure(null);
    setIsPicking(true);
    try {
      const picked = await from();
      if (!isMounted.current) {
        clearHeldReports();
      } else if (picked === "denied") {
        setFailure(SCREENING_MESSAGES.cameraDenied);
      } else if (picked) {
        if (file) discardFile(file.uri);
        setFile(picked);
      }
    } catch {
      setFailure(SCREENING_MESSAGES.pickFailed);
    } finally {
      setIsPicking(false);
    }
  }

  async function submit(): Promise<void> {
    if (!file || !outcome || isSubmitting.current) return;
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

          {file ? (
            <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{file.name}</Text>
          ) : null}
          <LoadingButton disabled={isUploading || isPicking} onPress={() => void pick(chooseReportFile)} variant="secondary">
            {file ? SCREENING_MESSAGES.chooseDifferentFile : SCREENING_MESSAGES.chooseFile}
          </LoadingButton>
          <LoadingButton disabled={isUploading || isPicking} onPress={() => void pick(takeReportPhoto)} variant="secondary">
            {SCREENING_MESSAGES.takePhoto}
          </LoadingButton>
          <LoadingButton disabled={isUploading || isPicking} onPress={() => void pick(chooseReportPhoto)} variant="secondary">
            {SCREENING_MESSAGES.photoLibrary}
          </LoadingButton>

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

          <LoadingButton disabled={!isReady} isLoading={isUploading} loadingText={SCREENING_MESSAGES.saving} onPress={() => void submit()}>
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
