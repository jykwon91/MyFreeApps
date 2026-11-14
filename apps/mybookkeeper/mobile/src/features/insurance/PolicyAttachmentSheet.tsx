import { INSURANCE_UPLOAD_MIME_TYPES } from "@mybookkeeper/api-client/constants/insuranceUploads";
import { useUploadInsurancePolicyAttachmentMutation } from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import { INSURANCE_ATTACHMENT_KIND_LABELS, INSURANCE_ATTACHMENT_KINDS } from "@mybookkeeper/api-client/constants/insuranceAttachmentKinds";
import type { InsuranceAttachmentKind } from "@mybookkeeper/api-client/types/insurance/insurance-attachment-kind";
import { Banner, filePart, LoadingButton, OptionRow, useTheme, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { DEFAULT_ATTACHMENT_KIND, POLICY_ATTACHMENT_MESSAGES, POLICY_PHOTO_NAME, POLICY_PHOTO_NO_SELECTION_LIMIT, POLICY_READER_MESSAGES, policyPhotoName } from "../../constants/insuranceForm";
import { UPLOAD_MESSAGES } from "../../constants/uploads";
import type { PhotoPreparing } from "../../types/PhotoPreparing";
import { confirmDiscard } from "../uploads/confirmDiscard";
import HeldFileButtons from "../uploads/HeldFileButtons";
import HeldFilesList from "../uploads/HeldFilesList";
import { useHeldFiles } from "../uploads/useHeldFiles";
import { useHeldPhotoPicker } from "../uploads/useHeldPhotoPicker";
import { attachmentUploadFailure } from "./policyFailure";

export default function PolicyAttachmentSheet({ policyId, onClose }: { policyId: string; onClose: () => void }) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [upload] = useUploadInsurancePolicyAttachmentMutation();
  const [kind, setKind] = useState<InsuranceAttachmentKind>(DEFAULT_ATTACHMENT_KIND);
  const [failure, setFailure] = useState<string | null>(null);
  const [progress, setProgress] = useState<PhotoPreparing | null>(null);
  const held = useHeldFiles(setFailure);
  const made = useRef(0);
  const picker = useHeldPhotoPicker({
    onReady: held.add,
    nextName: () => policyPhotoName((made.current += 1)),
    selectionLimit: POLICY_PHOTO_NO_SELECTION_LIMIT,
    messages: UPLOAD_MESSAGES,
  });
  const isSubmitting = useRef(false);
  const isUploading = progress !== null;
  const isPicking = held.isPicking || picker.isBusy;
  const files = held.files;

  function close(): void {
    if (isUploading || isPicking) return;
    if (files.length > 0) confirmDiscard(onClose);
    else onClose();
  }

  /** One at a time, like the web. A file that went up is let go, so a retry sends only what's left. */
  async function submit(): Promise<void> {
    if (files.length === 0 || isPicking || isSubmitting.current) return;
    isSubmitting.current = true;
    setFailure(null);
    const problems: string[] = [];
    let added = 0;
    try {
      for (const [index, file] of files.entries()) {
        setProgress({ done: index, total: files.length });
        const form = new FormData();
        form.append("file", filePart(file));
        form.append("kind", kind);
        try {
          await upload({ policyId, form }).unwrap();
          held.drop(file.uri);
          added += 1;
        } catch (error) {
          const reason = attachmentUploadFailure(error);
          problems.push(files.length === 1 ? reason : POLICY_ATTACHMENT_MESSAGES.failedNamed(file.name, reason));
        }
      }
    } finally {
      isSubmitting.current = false;
      setProgress(null);
    }
    if (added > 0) showToast(added === 1 ? POLICY_ATTACHMENT_MESSAGES.uploaded : POLICY_ATTACHMENT_MESSAGES.uploadedMany(added));
    if (problems.length === 0) onClose();
    else setFailure(problems.join("\n"));
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
        <HeldFilesList emptyText={POLICY_ATTACHMENT_MESSAGES.noFilesYet} files={files} isDisabled={isUploading} onRemove={held.drop} />
        {picker.problem ? <Banner message={picker.problem} /> : null}
        <HeldFileButtons
          file={null}
          fileTypes={INSURANCE_UPLOAD_MIME_TYPES}
          isDisabled={isUploading}
          isPicking={isPicking}
          onPick={(from) => void held.pick(from)}
          onPickPhoto={(source) => void picker.add(source)}
          photoName={POLICY_PHOTO_NAME}
          takePhotoLabel={POLICY_READER_MESSAGES.takePhoto}
        />
        <LoadingButton
          disabled={files.length === 0 || isPicking}
          isLoading={isUploading}
          loadingText={progress ? POLICY_ATTACHMENT_MESSAGES.uploadingProgress(progress.done, progress.total) : POLICY_ATTACHMENT_MESSAGES.uploading}
          onPress={() => void submit()}
        >
          {POLICY_ATTACHMENT_MESSAGES.uploadFile}
        </LoadingButton>
        <LoadingButton disabled={isUploading || isPicking} onPress={close} variant="ghost">
          {POLICY_ATTACHMENT_MESSAGES.cancel}
        </LoadingButton>
      </ScrollView>
    </Modal>
  );
}
