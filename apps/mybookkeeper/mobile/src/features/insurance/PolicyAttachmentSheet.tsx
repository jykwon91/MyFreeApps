import { INSURANCE_UPLOAD_MIME_TYPES } from "@mybookkeeper/api-client/constants/insuranceUploads";
import { useUploadInsurancePolicyAttachmentMutation } from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import { INSURANCE_ATTACHMENT_KIND_LABELS, INSURANCE_ATTACHMENT_KINDS } from "@mybookkeeper/api-client/constants/insuranceAttachmentKinds";
import type { InsuranceAttachmentKind } from "@mybookkeeper/api-client/types/insurance/insurance-attachment-kind";
import { Banner, filePart, LoadingButton, OptionRow, useTheme, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { DEFAULT_ATTACHMENT_KIND, POLICY_ATTACHMENT_MESSAGES, POLICY_PHOTO_NAME, POLICY_READER_MESSAGES } from "../../constants/insuranceForm";
import { confirmDiscard } from "../uploads/confirmDiscard";
import HeldFileButtons from "../uploads/HeldFileButtons";
import { useHeldFile } from "../uploads/useHeldFile";
import { attachmentUploadFailure } from "./policyFailure";

export default function PolicyAttachmentSheet({ policyId, onClose }: { policyId: string; onClose: () => void }) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [upload, { isLoading: isUploading }] = useUploadInsurancePolicyAttachmentMutation();
  const [kind, setKind] = useState<InsuranceAttachmentKind>(DEFAULT_ATTACHMENT_KIND);
  const [failure, setFailure] = useState<string | null>(null);
  const { file, isPicking, pick, forget } = useHeldFile(setFailure);
  const isSubmitting = useRef(false);

  function close(): void {
    if (isUploading || isPicking) return;
    if (file) confirmDiscard(onClose);
    else onClose();
  }

  async function submit(): Promise<void> {
    if (!file || isPicking || isSubmitting.current) return;
    isSubmitting.current = true;
    setFailure(null);
    const form = new FormData();
    form.append("file", filePart(file));
    form.append("kind", kind);
    try {
      await upload({ policyId, form }).unwrap();
      forget();
      onClose();
      showToast(POLICY_ATTACHMENT_MESSAGES.uploaded);
    } catch (error) {
      setFailure(attachmentUploadFailure(error));
    } finally {
      isSubmitting.current = false;
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet" visible>
      <ScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }} keyboardShouldPersistTaps="handled" style={{ flex: 1, backgroundColor: colors.background }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
          {POLICY_ATTACHMENT_MESSAGES.addFile}
        </Text>
        {failure ? <Banner message={failure} /> : null}
        <View accessibilityLabel={POLICY_ATTACHMENT_MESSAGES.kind} accessibilityRole="radiogroup" style={{ gap: spacing.xs }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{POLICY_ATTACHMENT_MESSAGES.kind}</Text>
          {INSURANCE_ATTACHMENT_KINDS.map((choice) => (
            <OptionRow
              isSelected={kind === choice}
              key={choice}
              label={INSURANCE_ATTACHMENT_KIND_LABELS[choice]}
              onPress={() => {
                if (!isUploading) setKind(choice);
              }}
            />
          ))}
        </View>
        <HeldFileButtons
          file={file}
          fileTypes={INSURANCE_UPLOAD_MIME_TYPES}
          isDisabled={isUploading}
          isPicking={isPicking}
          onPick={(from) => void pick(from)}
          photoName={POLICY_PHOTO_NAME}
          takePhotoLabel={POLICY_READER_MESSAGES.takePhoto}
        />
        <LoadingButton disabled={!file || isPicking} isLoading={isUploading} loadingText={POLICY_ATTACHMENT_MESSAGES.uploading} onPress={() => void submit()}>
          {POLICY_ATTACHMENT_MESSAGES.uploadFile}
        </LoadingButton>
        <LoadingButton disabled={isUploading || isPicking} onPress={close} variant="ghost">
          {POLICY_ATTACHMENT_MESSAGES.cancel}
        </LoadingButton>
      </ScrollView>
    </Modal>
  );
}
