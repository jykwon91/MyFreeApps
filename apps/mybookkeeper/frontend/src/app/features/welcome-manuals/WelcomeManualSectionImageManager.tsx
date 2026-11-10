import { useCallback, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Upload } from "lucide-react";
import { LoadingButton, ConfirmDialog, showError, showSuccess } from "@platform/ui";
import { WELCOME_MANUAL_MAX_SECTION_IMAGES } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import { validateSectionImages } from "@mybookkeeper/api-client/utils/welcomeManualImageValidation";
import {
  useDeleteSectionImageMutation,
  useReorderSectionImagesMutation,
  useUpdateSectionImageMutation,
  useUploadSectionImagesMutation,
} from "@mybookkeeper/api-client/store/welcomeManualsApi";
import { reorderFailureMessage } from "./reorder-failure-message";
import type { SectionImageLightboxTarget } from "@/shared/types/welcome-manual/section-image-lightbox-target";
import type { WelcomeManualSectionImageResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-image-response";
import PhotoLightbox from "@/app/features/listings/PhotoLightbox";
import WelcomeManualSectionImageCard from "./WelcomeManualSectionImageCard";
import { buildSectionImageForm } from "./build-section-image-form";
import { sectionImageToLightboxPhoto } from "./section-image-to-lightbox";

export interface WelcomeManualSectionImageManagerProps {
  manualId: string;
  sectionId: string;
  images: readonly WelcomeManualSectionImageResponse[];
}

export default function WelcomeManualSectionImageManager({
  manualId,
  sectionId,
  images,
}: WelcomeManualSectionImageManagerProps) {
  const [uploadImages, { isLoading: isUploading }] = useUploadSectionImagesMutation();
  const [deleteImage] = useDeleteSectionImageMutation();
  const [updateImage] = useUpdateSectionImageMutation();
  const [reorderImages] = useReorderSectionImagesMutation();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);
  const [lightboxTarget, setLightboxTarget] = useState<SectionImageLightboxTarget | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const atCap = images.length >= WELCOME_MANUAL_MAX_SECTION_IMAGES;
  const sortedImages = [...images].sort((a, b) => a.display_order - b.display_order);
  const displayIds = orderedIds ?? sortedImages.map((img) => img.id);
  const imagesById = new Map(sortedImages.map((img) => [img.id, img]));

  const handleLightboxNavigate = useCallback(
    (nextIndex: number) => {
      setLightboxTarget({ sectionId, index: nextIndex });
    },
    [sectionId],
  );

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const { valid, rejected } = validateSectionImages(Array.from(files));
    if (rejected.length > 0) {
      showError(rejected.join("; "));
    }
    if (valid.length === 0) return;
    if (images.length + valid.length > WELCOME_MANUAL_MAX_SECTION_IMAGES) {
      showError(`A section can have at most ${WELCOME_MANUAL_MAX_SECTION_IMAGES} photos. Choose fewer and try again.`);
      return;
    }
    try {
      await uploadImages({ manualId, sectionId, form: buildSectionImageForm(valid) }).unwrap();
      showSuccess(valid.length === 1 ? "Photo added." : `${valid.length} photos added.`);
    } catch {
      showError("I couldn't upload that. Want to try again?");
    }
  }

  async function handleConfirmDelete() {
    const imageId = confirmDeleteId;
    if (!imageId) return;
    setConfirmDeleteId(null);
    try {
      await deleteImage({ manualId, sectionId, imageId }).unwrap();
      showSuccess("Photo removed.");
    } catch {
      showError("I couldn't remove that photo. Want to try again?");
    }
  }

  async function handleCaptionSave(imageId: string, caption: string) {
    try {
      await updateImage({ manualId, sectionId, imageId, data: { caption: caption || null } }).unwrap();
    } catch {
      showError("I couldn't save that caption. Want to try again?");
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = displayIds.indexOf(String(active.id));
    const newIndex = displayIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(displayIds, oldIndex, newIndex);
    setOrderedIds(newOrder);

    try {
      await reorderImages({ manualId, sectionId, imageIds: newOrder }).unwrap();
    } catch (err) {
      showError(reorderFailureMessage(err));
      setOrderedIds(null);
    }
  }

  const lightboxPhotos = displayIds
    .map((id) => imagesById.get(id))
    .filter((img): img is WelcomeManualSectionImageResponse => img !== undefined)
    .map(sectionImageToLightboxPhoto);

  return (
    <div className="space-y-3" data-testid="welcome-manual-image-manager">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {atCap
            ? `You've reached the ${WELCOME_MANUAL_MAX_SECTION_IMAGES}-photo limit for this section.`
            : "JPEG, PNG, or HEIC. 10MB max each. EXIF metadata (including GPS) is stripped on upload."}
        </p>
        <LoadingButton
          variant="secondary"
          size="sm"
          isLoading={isUploading}
          loadingText="Uploading…"
          disabled={atCap}
          onClick={() => fileInputRef.current?.click()}
          type="button"
          data-testid="welcome-manual-image-upload-button"
        >
          <Upload className="h-4 w-4 mr-1" />
          Add photos
        </LoadingButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic,.heic,.heif"
          multiple
          className="hidden"
          data-testid="welcome-manual-image-file-input"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {sortedImages.length === 0 ? (
        <p
          className="text-sm text-muted-foreground border rounded-lg p-6 text-center"
          data-testid="welcome-manual-image-empty-state"
        >
          No photos yet. Add a few to show guests exactly what to do.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={displayIds} strategy={rectSortingStrategy}>
            <ul
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
              data-testid="welcome-manual-image-grid"
            >
              {displayIds.map((imageId, index) => {
                const image = imagesById.get(imageId);
                if (!image) return null;
                return (
                  <WelcomeManualSectionImageCard
                    key={imageId}
                    image={image}
                    onDelete={() => setConfirmDeleteId(imageId)}
                    onOpen={() => setLightboxTarget({ sectionId, index })}
                    onCaptionSave={(caption) => void handleCaptionSave(imageId, caption)}
                  />
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Remove this photo?"
        description="The photo will be deleted from this section. This can't be undone."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {lightboxTarget ? (
        <PhotoLightbox
          photos={lightboxPhotos}
          currentIndex={lightboxTarget.index}
          onClose={() => setLightboxTarget(null)}
          onNavigate={handleLightboxNavigate}
        />
      ) : null}
    </div>
  );
}
