import { LEASE_ATTACHMENT_KIND_LABELS } from "@mybookkeeper/api-client/constants/leaseLabels";
import { useUploadSignedLeaseAttachmentMutation } from "@mybookkeeper/api-client/store/signedLeasesApi";
import type { LeaseAttachmentKind } from "@mybookkeeper/api-client/types/lease/lease-attachment-kind";
import { inferKindsForFiles } from "@mybookkeeper/api-client/utils/inferAttachmentKind";
import { Banner, filePart, LoadingButton, OptionRow, useTheme, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { addedFile, addedFiles, LEASE_FILE_TYPES, LEASE_MESSAGES, LEASE_PHOTO_NAME, LEASE_UPLOAD_KINDS } from "../../constants/leases";
import { confirmDiscard } from "../uploads/confirmDiscard";
import HeldFileButtons from "../uploads/HeldFileButtons";
import HeldFilesList from "../uploads/HeldFilesList";
import { useHeldFiles } from "../uploads/useHeldFiles";
import { leaseUploadFailure } from "./leaseUploadFailure";

interface LeaseUploadSheetProps {
  leaseId: string;
  /** Set when the host asked for a particular file, such as the signed copy. Null works the kind out from each file's name. */
  initialKind: LeaseAttachmentKind | null;
  onClose: () => void;
}

export default function LeaseUploadSheet({ leaseId, initialKind, onClose }: LeaseUploadSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [upload] = useUploadSignedLeaseAttachmentMutation();
  const [kind, setKind] = useState(initialKind);
  const [failure, setFailure] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { files, isPicking, pick, drop } = useHeldFiles(setFailure);
  const isSubmitting = useRef(false);

  function close(): void {
    if (isUploading || isPicking) return;
    if (files.length > 0) confirmDiscard(onClose);
    else onClose();
  }

  /** One at a time. A file that went up is let go, so a retry sends only what's left. */
  async function submit(): Promise<void> {
    if (files.length === 0 || isPicking || isSubmitting.current) return;
    isSubmitting.current = true;
    setIsUploading(true);
    setFailure(null);
    const kinds = kind ? files.map(() => kind) : inferKindsForFiles(files.map((file) => file.name));
    let added = 0;
    let lastName = "";
    try {
      for (const [index, file] of files.entries()) {
        const form = new FormData();
        form.append("file", filePart(file));
        form.append("kind", kinds[index]);
        await upload({ leaseId, form }).unwrap();
        drop(file.uri);
        added += 1;
        lastName = file.name;
      }
      onClose();
    } catch (error) {
      setFailure(leaseUploadFailure(error));
    } finally {
      if (added > 0) showToast(added === 1 ? addedFile(lastName) : addedFiles(added));
      isSubmitting.current = false;
      setIsUploading(false);
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
          <OptionRow
            isSelected={kind === null}
            label={LEASE_MESSAGES.autoKind}
            onPress={() => {
              if (!isUploading) setKind(null);
            }}
          />
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

        <HeldFilesList emptyText={LEASE_MESSAGES.noFilesYet} files={files} isDisabled={isUploading} onRemove={drop} />
        <HeldFileButtons
          file={null}
          fileTypes={LEASE_FILE_TYPES}
          isDisabled={isUploading}
          isPicking={isPicking}
          onPick={(from) => void pick(from)}
          photoName={LEASE_PHOTO_NAME}
          takePhotoLabel={LEASE_MESSAGES.takePhoto}
        />

        <LoadingButton disabled={files.length === 0 || isPicking} isLoading={isUploading} loadingText={LEASE_MESSAGES.uploading} onPress={() => void submit()}>
          {LEASE_MESSAGES.saveFile}
        </LoadingButton>
        <LoadingButton disabled={isUploading || isPicking} onPress={close} variant="ghost">
          {LEASE_MESSAGES.cancel}
        </LoadingButton>
      </ScrollView>
    </Modal>
  );
}
