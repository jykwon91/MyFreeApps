import { useRef, useState } from "react";
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
import LoadingButton from "@/shared/components/ui/LoadingButton";
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useDeleteListingPhotoMutation,
  useUpdateListingPhotoMutation,
  useUploadListingPhotosMutation,
} from "@/shared/store/listingsApi";
import type { ListingPhoto } from "@/shared/types/listing/listing-photo";
import ListingPhotoCard from "@/app/features/listings/ListingPhotoCard";

export interface ListingPhotoManagerProps {
  listingId: string;
  photos: readonly ListingPhoto[];
}

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/heic"];

function clientSideValidate(files: File[]): { valid: File[]; rejected: string[] } {
  const valid: File[] = [];
  const rejected: string[] = [];
  for (const f of files) {
    if (f.size > MAX_BYTES) {
      rejected.push(`${f.name} is over 10MB`);
      continue;
    }
    // Some browsers don't set content-type for HEIC; fall back to extension check.
    const isHeicByExt = /\.(heic|heif)$/i.test(f.name);
    if (!ALLOWED_MIME.includes(f.type) && !isHeicByExt) {
      rejected.push(`${f.name} is not a supported image type`);
      continue;
    }
    valid.push(f);
  }
  return { valid, rejected };
}

export default function ListingPhotoManager({ listingId, photos }: ListingPhotoManagerProps) {
  const [uploadPhotos, { isLoading: isUploading }] = useUploadListingPhotosMutation();
  const [deletePhoto] = useDeleteListingPhotoMutation();
  const [updatePhoto] = useUpdateListingPhotoMutation();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortedPhotos = [...photos].sort((a, b) => a.display_order - b.display_order);
  const displayIds = orderedIds ?? sortedPhotos.map((p) => p.id);
  const photosById = new Map(sortedPhotos.map((p) => [p.id, p]));

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const { valid, rejected } = clientSideValidate(Array.from(files));
    if (rejected.length > 0) {
      showError(rejected.join("; "));
    }
    if (valid.length === 0) return;
    try {
      await uploadPhotos({ listingId, files: valid }).unwrap();
      showSuccess(
        valid.length === 1 ? "Photo uploaded." : `${valid.length} photos uploaded.`,
      );
    } catch {
      showError("I couldn't upload that. Want to try again?");
    }
  }

  async function handleConfirmDelete() {
    const photoId = confirmDeleteId;
    if (!photoId) return;
    setConfirmDeleteId(null);
    try {
      await deletePhoto({ listingId, photoId }).unwrap();
      showSuccess("Photo removed.");
    } catch {
      showError("I couldn't remove that photo. Want to try again?");
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

    // Persist the new ordering. Each photo whose position changed gets its
    // display_order rewritten to the new index. We fire one PATCH per moved
    // photo — the small-N case (<20 photos per listing) keeps this cheap.
    try {
      await Promise.all(
        newOrder.map((photoId, index) => {
          const current = photosById.get(photoId);
          if (!current) return Promise.resolve();
          if (current.display_order === index) return Promise.resolve();
          return updatePhoto({ listingId, photoId, display_order: index }).unwrap();
        }),
      );
    } catch {
      showError("I couldn't save the new order. Reverting.");
      setOrderedIds(null);
    }
  }

  return (
    <div className="space-y-3" data-testid="listing-photo-manager">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          JPEG, PNG, or HEIC. 10MB max each. EXIF metadata (including GPS) is
          stripped on upload.
        </p>
        <LoadingButton
          variant="secondary"
          size="sm"
          isLoading={isUploading}
          loadingText="Uploading..."
          onClick={() => fileInputRef.current?.click()}
          type="button"
          data-testid="listing-photo-upload-button"
        >
          <Upload className="h-4 w-4 mr-1" />
          Upload photos
        </LoadingButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic,.heic,.heif"
          multiple
          className="hidden"
          data-testid="listing-photo-file-input"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {sortedPhotos.length === 0 ? (
        <p
          className="text-sm text-muted-foreground border rounded-lg p-6 text-center"
          data-testid="listing-photo-empty-state"
        >
          No photos yet. Upload a few to make this listing pop on Furnished
          Finder.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={displayIds} strategy={rectSortingStrategy}>
            <ul
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
              data-testid="listing-photo-grid"
            >
              {displayIds.map((photoId) => {
                const photo = photosById.get(photoId);
                if (!photo) return null;
                return (
                  <ListingPhotoCard
                    key={photoId}
                    photo={photo}
                    onDelete={() => setConfirmDeleteId(photoId)}
                  />
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Remove this photo?"
        description="The photo will be deleted from this listing. This can't be undone."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
