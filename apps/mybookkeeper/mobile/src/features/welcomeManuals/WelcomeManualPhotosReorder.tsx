import { useReorderSectionImagesMutation } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import type { WelcomeManualSectionResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-response";
import { WELCOME_MANUAL_PHOTO_MESSAGES, unnamedPhotoLabel } from "../../constants/welcomeManualForms";
import WelcomeManualReorderSheet from "./WelcomeManualReorderSheet";
import { PHOTO_WORDS } from "../../constants/welcomeManualSheets";

interface WelcomeManualPhotosReorderProps {
  manualId: string;
  section: WelcomeManualSectionResponse;
  onClose: () => void;
}

export default function WelcomeManualPhotosReorder({ manualId, section, onClose }: WelcomeManualPhotosReorderProps) {
  const [reorderImages] = useReorderSectionImagesMutation();
  return (
    <WelcomeManualReorderSheet
      items={section.images.map((image) => ({ id: image.id, label: image.caption, thumbnailUri: image.is_available === false ? null : image.presigned_url }))}
      onClose={onClose}
      unnamedLabel={unnamedPhotoLabel}
      reorder={(imageIds) => reorderImages({ manualId, sectionId: section.id, imageIds }).unwrap()}
      title={WELCOME_MANUAL_PHOTO_MESSAGES.reorderTitle}
      words={PHOTO_WORDS}
    />
  );
}
