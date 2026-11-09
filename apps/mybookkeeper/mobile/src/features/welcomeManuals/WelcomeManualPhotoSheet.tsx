import { WELCOME_MANUAL_IMAGE_CAPTION_MAX_LENGTH } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import { useDeleteSectionImageMutation, useUpdateSectionImageMutation } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import type { WelcomeManualCaptionFormValues } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-caption-form-values";
import type { WelcomeManualSectionImageResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-image-response";
import { captionProblems } from "@mybookkeeper/api-client/utils/welcomeManualProblems";
import { FormField } from "@platform/mobile";
import { DELETE_PHOTO_BODY, DELETE_PHOTO_TITLE, WELCOME_MANUAL_PHOTO_MESSAGES as MESSAGES } from "../../constants/welcomeManualForms";
import { useSnapshotForm } from "../../lib/useSnapshotForm";
import WelcomeManualEditSheet from "./WelcomeManualEditSheet";
import WelcomeManualPhoto from "./WelcomeManualPhoto";
import { useWelcomeManualItemWrites } from "./useWelcomeManualItemWrites";
import { PHOTO_WORDS, PHOTO_SHEET_LABELS } from "../../constants/welcomeManualSheets";

interface WelcomeManualPhotoSheetProps {
  manualId: string;
  sectionId: string;
  image: WelcomeManualSectionImageResponse;
  onClose: () => void;
}

const never = (): Promise<unknown> => Promise.resolve();

/** A photo full size, with its caption to change and a way to delete it. */
export default function WelcomeManualPhotoSheet({ manualId, sectionId, image, onClose }: WelcomeManualPhotoSheetProps) {
  const [updateImage] = useUpdateSectionImageMutation();
  const [deleteImage] = useDeleteSectionImageMutation();
  const form = useSnapshotForm<WelcomeManualCaptionFormValues>(() => ({ caption: image.caption ?? "" }), captionProblems);
  const writes = useWelcomeManualItemWrites({
    words: PHOTO_WORDS,
    isNew: false,
    hasChanges: form.isDirty,
    messages: { added: MESSAGES.uploadedOne, saved: MESSAGES.saved, deleted: MESSAGES.deleted, alreadyDeleted: MESSAGES.alreadyDeleted },
    create: never,
    update: () => updateImage({ manualId, sectionId, imageId: image.id, data: { caption: form.values.caption.trim() || null } }).unwrap(),
    remove: () => deleteImage({ manualId, sectionId, imageId: image.id }).unwrap(),
    onDone: onClose,
  });

  return (
    <WelcomeManualEditSheet
      confirmDelete={{ title: DELETE_PHOTO_TITLE, body: DELETE_PHOTO_BODY }}
      failure={writes.failure}
      isBusy={writes.isBusy}
      isDeleting={writes.isDeleting}
      isDirty={form.isDirty}
      isNew={false}
      isSaving={writes.isSaving}
      labels={PHOTO_SHEET_LABELS}
      onClose={onClose}
      onDelete={() => void writes.destroy()}
      onSave={() => { if (form.validate()) void writes.save(); }}
      title={MESSAGES.view}
    >
      <WelcomeManualPhoto image={image} size="full" />
      <FormField editable={!writes.isBusy} error={form.errorFor("caption")} label={MESSAGES.captionLabel} maxLength={WELCOME_MANUAL_IMAGE_CAPTION_MAX_LENGTH} multiline onChangeText={(text) => form.edit("caption", text)} placeholder={MESSAGES.captionPlaceholder} value={form.values.caption} />
    </WelcomeManualEditSheet>
  );
}
