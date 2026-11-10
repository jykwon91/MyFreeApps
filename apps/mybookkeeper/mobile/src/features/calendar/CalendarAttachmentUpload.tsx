import { BLACKOUT_ATTACHMENT_MIME_TYPES } from "@mybookkeeper/api-client/constants/blackoutAttachments";
import { useUploadBlackoutAttachmentMutation } from "@mybookkeeper/api-client/store/calendarApi";
import { Banner, filePart, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { View } from "react-native";
import { CALENDAR_ATTACHMENT_FILE_TYPES, CALENDAR_ATTACHMENT_PHOTO_NAME, EVENT_MESSAGES } from "../../constants/calendarEventDetail";
import HeldFileButtons from "../uploads/HeldFileButtons";
import { useHeldFile } from "../uploads/useHeldFile";
import { attachmentUploadFailure } from "./calendarEventFailures";

/** Closed, it's one button. Open, it picks a file and sends it. */
export default function CalendarAttachmentUpload({ blackoutId }: { blackoutId: string }) {
  const { spacing } = useTheme();
  const { showToast } = useToast();
  const [upload, { isLoading: isUploading }] = useUploadBlackoutAttachmentMutation();
  const [isOpen, setIsOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const isSubmitting = useRef(false);
  const { file, isPicking, pick, forget } = useHeldFile(setFailure);

  function close(): void {
    forget();
    setFailure(null);
    setIsOpen(false);
  }

  async function submit(): Promise<void> {
    if (!file || isPicking || isSubmitting.current) return;
    if (!BLACKOUT_ATTACHMENT_MIME_TYPES.includes(file.mimeType)) {
      setFailure(EVENT_MESSAGES.uploadBadType);
      return;
    }
    isSubmitting.current = true;
    setFailure(null);
    const form = new FormData();
    form.append("file", filePart(file));
    try {
      await upload({ blackoutId, form }).unwrap();
      close();
      showToast(EVENT_MESSAGES.uploaded);
    } catch (error) {
      setFailure(attachmentUploadFailure(error));
    } finally {
      isSubmitting.current = false;
    }
  }

  if (!isOpen) {
    return (
      <LoadingButton onPress={() => setIsOpen(true)} variant="secondary">
        {EVENT_MESSAGES.addFile}
      </LoadingButton>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      {failure ? <Banner message={failure} /> : null}
      <HeldFileButtons
        file={file}
        fileTypes={CALENDAR_ATTACHMENT_FILE_TYPES}
        isDisabled={isUploading}
        isPicking={isPicking}
        onPick={(from) => void pick(from)}
        photoName={CALENDAR_ATTACHMENT_PHOTO_NAME}
        takePhotoLabel="Take a photo"
      />
      <LoadingButton disabled={!file || isPicking} isLoading={isUploading} loadingText={EVENT_MESSAGES.uploading} onPress={() => void submit()}>
        {EVENT_MESSAGES.uploadFile}
      </LoadingButton>
      <LoadingButton disabled={isUploading || isPicking} onPress={close} variant="ghost">
        {EVENT_MESSAGES.cancel}
      </LoadingButton>
    </View>
  );
}
