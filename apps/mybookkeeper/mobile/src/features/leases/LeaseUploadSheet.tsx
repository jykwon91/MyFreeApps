import { LEASE_ATTACHMENT_KIND_LABELS } from "@mybookkeeper/api-client/constants/leaseLabels";
import { useUploadSignedLeaseAttachmentMutation } from "@mybookkeeper/api-client/store/signedLeasesApi";
import type { LeaseAttachmentKind } from "@mybookkeeper/api-client/types/lease/lease-attachment-kind";
import { Banner, LoadingButton, OptionRow, useTheme, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { addedFile, LEASE_FILE_TYPES, LEASE_MESSAGES, LEASE_PHOTO_NAME, LEASE_UPLOAD_KINDS } from "../../constants/leases";
import { filePart } from "../../lib/filePart";
import { confirmDiscard } from "../uploads/confirmDiscard";
import HeldFileButtons from "../uploads/HeldFileButtons";
import { useHeldFile } from "../uploads/useHeldFile";
import { leaseUploadFailure } from "./leaseUploadFailure";

interface LeaseUploadSheetProps {
  leaseId: string;
  /** Set when the host asked for a particular file, such as the signed copy. */
  initialKind: LeaseAttachmentKind | null;
  onClose: () => void;
}

export default function LeaseUploadSheet({ leaseId, initialKind, onClose }: LeaseUploadSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [upload, { isLoading: isUploading }] = useUploadSignedLeaseAttachmentMutation();
  const [kind, setKind] = useState(initialKind);
  const [failure, setFailure] = useState<string | null>(null);
  const { file, isPicking, pick, forget } = useHeldFile(setFailure);
  const isSubmitting = useRef(false);

  function close(): void {
    if (isUploading || isPicking) return;
    if (file) confirmDiscard(onClose);
    else onClose();
  }

  async function submit(): Promise<void> {
    if (!file || !kind || isPicking || isSubmitting.current) return;
    isSubmitting.current = true;
    setFailure(null);
    const form = new FormData();
    form.append("file", filePart(file));
    form.append("kind", kind);
    try {
      await upload({ leaseId, form }).unwrap();
      forget();
      onClose();
      showToast(addedFile(file.name));
    } catch (error) {
      setFailure(leaseUploadFailure(error));
    } finally {
      isSubmitting.current = false;
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet" visible>
      <ScrollView
        contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
          {LEASE_MESSAGES.addFile}
        </Text>
        {failure ? <Banner message={failure} /> : null}

        <View accessibilityLabel={LEASE_MESSAGES.fileKind} accessibilityRole="radiogroup" style={{ gap: spacing.xs }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{LEASE_MESSAGES.fileKind}</Text>
          {LEASE_UPLOAD_KINDS.map((choice) => (
            <OptionRow
              isSelected={kind === choice}
              key={choice}
              label={LEASE_ATTACHMENT_KIND_LABELS[choice]}
              onPress={() => {
                if (!isUploading) setKind(choice);
              }}
            />
          ))}
        </View>

        <HeldFileButtons
          file={file}
          fileTypes={LEASE_FILE_TYPES}
          isDisabled={isUploading}
          isPicking={isPicking}
          onPick={(from) => void pick(from)}
          photoName={LEASE_PHOTO_NAME}
          takePhotoLabel={LEASE_MESSAGES.takePhoto}
        />

        <LoadingButton disabled={!file || !kind || isPicking} isLoading={isUploading} loadingText={LEASE_MESSAGES.uploading} onPress={() => void submit()}>
          {LEASE_MESSAGES.saveFile}
        </LoadingButton>
        <LoadingButton disabled={isUploading || isPicking} onPress={close} variant="ghost">
          {LEASE_MESSAGES.cancel}
        </LoadingButton>
      </ScrollView>
    </Modal>
  );
}
