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
import { LoadingButton, ConfirmDialog } from "@platform/ui";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { validateSectionImages } from "@/shared/lib/validate-section-images";
import {
  useDeleteSectionImageMutation,
  useUpdateSectionImageMutation,
  useUploadSectionImagesMutation,
} from "@/shared/store/welcomeManualsApi";
import type { SectionImageLightboxTarget } from "@/shared/types/welcome-manual/section-image-lightbox-target";
import type { WelcomeManualSectionImageResponse } from "@/shared/types/welcome-manual/welcome-manual-section-image-response";
import PhotoLightbox from "@/app/features/listings/PhotoLightbox";
import WelcomeManualSectionImageCard from "./WelcomeManualSectionImageCard";
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);
  const [lightboxTarget, setLightboxTarget] = useState<SectionImageLightboxTarget | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
    try {
      await uploadImages({ manualId, sectionId, files: valid }).unwrap();
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
      await updateImage({ manualId, sectionId, imageId, caption: caption || null }).unwrap();
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

    // There's no bulk-order endpoint for section images — fire one PATCH per
    // image whose display_order changed. Small-N (a handful of photos per
    // section) keeps this cheap, mirroring ListingPhotoManager.
    try {
      await Promise.all(
        newOrder.map((imageId, index) => {
          const current = imagesById.get(imageId);
          if (!current) return Promise.resolve();
          if (current.display_order === index) return Promise.resolve();
          return updateImage({ manualId, sectionId, imageId, display_order: index }).unwrap();
        }),
      );
    } catch {
      showError("I couldn't save the new order. Reverting.");
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
          JPEG, PNG, or HEIC. 10MB max each. EXIF metadata (including GPS) is
          stripped on upload.
        </p>
        <LoadingButton
          variant="secondary"
          size="sm"
          isLoading={isUploading}
          loadingText="Uploading…"
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
