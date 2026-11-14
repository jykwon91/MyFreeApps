import { WELCOME_MANUAL_MAX_SECTION_IMAGES } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import type { WelcomeManualSectionImageResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-image-response";
import { useState } from "react";
import { WELCOME_MANUAL_PHOTO_THUMBNAIL as THUMBNAIL, WELCOME_MANUAL_PHOTO_MESSAGES as MESSAGES } from "../../constants/welcomeManualForms";
import { useCanWrite } from "../workspace/useCanWrite";
import WelcomeManualItemList from "./WelcomeManualItemList";
import WelcomeManualItemRow from "./WelcomeManualItemRow";
import WelcomeManualPhoto from "./WelcomeManualPhoto";
import WelcomeManualPhotosReorder from "./WelcomeManualPhotosReorder";
import WelcomeManualPhotoSheet from "./WelcomeManualPhotoSheet";
import WelcomeManualPhotoUploadSheet from "./WelcomeManualPhotoUploadSheet";
import WelcomeManualPhotoViewer from "./WelcomeManualPhotoViewer";
import WelcomeManualSectionGate from "./WelcomeManualSectionGate";
import type { WelcomeManualSectionScreenProps } from "../../types/WelcomeManualSectionScreenProps";

export default function WelcomeManualPhotosScreen({ manualId, sectionId }: WelcomeManualSectionScreenProps) {
  const canWrite = useCanWrite();
  const [viewId, setViewId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  return (
    <WelcomeManualSectionGate manualId={manualId} sectionId={sectionId}>
      {({ refreshControl }, section) => {
        const open: WelcomeManualSectionImageResponse | undefined = section.images.find((image) => image.id === editId);
        const viewIndex = section.images.findIndex((image) => image.id === viewId);
        return (
          <>
            <WelcomeManualItemList
              addLabel={MESSAGES.add}
              atLimit={MESSAGES.atLimit}
              canAdd={section.images.length < WELCOME_MANUAL_MAX_SECTION_IMAGES}
              emptyBody={MESSAGES.choosePhotos}
              emptyHeading={MESSAGES.none}
              items={section.images}
              keyOf={(image) => image.id}
              onAdd={() => setIsUploading(true)}
              onReorder={() => setIsReordering(true)}
              refreshControl={refreshControl}
              renderItem={(image) => (
                <WelcomeManualItemRow
                  accessibilityLabel={`${MESSAGES.view}, ${image.caption ?? MESSAGES.noCaption}`}
                  leading={<WelcomeManualPhoto image={image} size={THUMBNAIL} />}
                  onPress={() => setViewId(image.id)}
                  subtitle={image.caption ?? MESSAGES.noCaption}
                  title={MESSAGES.view}
                />
              )}
              reorderLabel={MESSAGES.reorder}
              testID="welcome-manual-photos-list"
            />
            {viewIndex >= 0 ? (
              <WelcomeManualPhotoViewer
                images={section.images}
                onClose={() => setViewId(null)}
                onEdit={canWrite ? (image) => { setViewId(null); setEditId(image.id); } : undefined}
                startIndex={viewIndex}
              />
            ) : null}
            {open ? <WelcomeManualPhotoSheet image={open} manualId={manualId} onClose={() => setEditId(null)} sectionId={sectionId} /> : null}
            {isUploading ? <WelcomeManualPhotoUploadSheet existingCount={section.images.length} manualId={manualId} onClose={() => setIsUploading(false)} sectionId={sectionId} /> : null}
            {isReordering ? <WelcomeManualPhotosReorder manualId={manualId} onClose={() => setIsReordering(false)} section={section} /> : null}
          </>
        );
      }}
    </WelcomeManualSectionGate>
  );
}
