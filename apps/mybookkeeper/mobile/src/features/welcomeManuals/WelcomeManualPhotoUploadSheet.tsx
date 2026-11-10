import { SECTION_IMAGE_PICKER_MIME, WELCOME_MANUAL_MAX_SECTION_IMAGES } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import { useUploadSectionImagesMutation } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import { validateSectionImages } from "@mybookkeeper/api-client/utils/welcomeManualImageValidation";
import { filePart, FormSheet, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { Text } from "react-native";
import { UPLOAD_MESSAGES, preparingProgress } from "../../constants/uploads";
import { WELCOME_MANUAL_PHOTO_MESSAGES as MESSAGES, photosLeftLabel, rejectedPhotosMessage, sectionPhotoName } from "../../constants/welcomeManualForms";
import { useWrite } from "../../lib/useWrite";
import type { WelcomeManualPhotoUploadSheetProps } from "../../types/WelcomeManualPhotoUploadSheetProps";
import HeldFilesList from "../uploads/HeldFilesList";
import { chooseHeldFile } from "../uploads/pickHeldFile";
import { confirmDiscard } from "../uploads/confirmDiscard";
import { useHeldFiles } from "../uploads/useHeldFiles";
import { useHeldPhotoPicker } from "../uploads/useHeldPhotoPicker";
import { uploadFailure } from "./welcomeManualFailure";

/** Photos are picked, held, and sent together in one request. */
export default function WelcomeManualPhotoUploadSheet({ manualId, sectionId, existingCount, onClose }: WelcomeManualPhotoUploadSheetProps) {
  const { colors, fontSize } = useTheme();
  const { showToast } = useToast();
  const [uploadImages] = useUploadSectionImagesMutation();
  const [pickProblem, setPickProblem] = useState<string | null>(null);
  const held = useHeldFiles(setPickProblem);
  const made = useRef(0);
  const write = useWrite();
  const room = WELCOME_MANUAL_MAX_SECTION_IMAGES - existingCount - held.files.length;
  const nextName = (extension?: string): string => sectionPhotoName((made.current += 1), extension);
  const picker = useHeldPhotoPicker({
    onReady: held.add,
    nextName: () => nextName(),
    // The library won't let the person choose more than fit, so nothing is dropped after the fact.
    selectionLimit: Math.max(room, 1),
    messages: UPLOAD_MESSAGES,
  });
  const failure = write.error ? uploadFailure(write.error) : (pickProblem ?? picker.problem);
  const locked = write.isBusy;
  const isBusy = held.isPicking || picker.isBusy;
  const cannotAdd = locked || isBusy || room <= 0;

  function close(): void {
    if (locked) return;
    if (held.files.length > 0) confirmDiscard(onClose);
    else onClose();
  }

  async function chooseFile(): Promise<void> {
    await held.pick(async () => {
      const file = await chooseHeldFile(SECTION_IMAGE_PICKER_MIME);
      return file && { ...file, name: nextName(file.mimeType === "image/png" ? "png" : "jpg") };
    });
  }

  async function upload(): Promise<void> {
    if (held.files.length === 0) {
      setPickProblem(MESSAGES.noneChosen);
      return;
    }
    const { valid, rejected } = validateSectionImages(held.files.map((file) => ({ file, name: file.name, type: file.mimeType, size: file.size })));
    if (rejected.length > 0) {
      setPickProblem(rejectedPhotosMessage(rejected));
      return;
    }
    const form = new FormData();
    for (const { file } of valid) form.append("files", filePart(file));
    const result = await held.whileSending(() => write.run(() => uploadImages({ manualId, sectionId, form }).unwrap()));
    if (result !== "done") return;
    const count = valid.length;
    held.forgetAll();
    onClose();
    showToast(count === 1 ? MESSAGES.uploadedOne : MESSAGES.uploadedMany);
  }

  return (
    <FormSheet failure={failure} isOpen onRequestClose={close} title={MESSAGES.uploadTitle}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{room > 0 ? photosLeftLabel(room) : MESSAGES.atLimit}</Text>
      <LoadingButton disabled={cannotAdd} isLoading={picker.preparing !== null} loadingText={picker.preparing ? preparingProgress(picker.preparing.done, picker.preparing.total) : undefined} onPress={() => void picker.add("library")} variant="secondary">
        {UPLOAD_MESSAGES.photoLibrary}
      </LoadingButton>
      <LoadingButton disabled={cannotAdd} onPress={() => void picker.add("camera")} variant="secondary">
        {MESSAGES.takePhoto}
      </LoadingButton>
      <LoadingButton disabled={cannotAdd} isLoading={held.isPicking} onPress={() => void chooseFile()} variant="secondary">
        {UPLOAD_MESSAGES.chooseFile}
      </LoadingButton>
      <HeldFilesList emptyText={MESSAGES.noneChosen} files={held.files} isDisabled={locked} onRemove={held.drop} showThumbnails />
      <LoadingButton disabled={locked || isBusy} isLoading={locked} loadingText={MESSAGES.uploading} onPress={() => void upload()}>
        {MESSAGES.upload}
      </LoadingButton>
      <LoadingButton disabled={locked} onPress={close} variant="ghost">
        {MESSAGES.cancel}
      </LoadingButton>
    </FormSheet>
  );
}
