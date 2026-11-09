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
import { useDispatch } from "react-redux";
import { LoadingButton, ConfirmDialog, showError, showSuccess } from "@platform/ui";
import {
  listingsApi,
  useDeleteListingPhotoMutation,
  useReorderListingPhotosMutation,
  useUploadListingPhotosMutation,
} from "@mybookkeeper/api-client/store/listingsApi";
import {
  LISTING_PHOTO_HEIC_EXTENSION,
  LISTING_PHOTO_MAX_BYTES,
  LISTING_PHOTO_MAX_MB,
  LISTING_PHOTO_MIME_TYPES,
} from "@mybookkeeper/api-client/constants/listingPhotos";
import { writeFailure } from "@mybookkeeper/api-client/utils/writeFailure";
import { sortPhotos } from "@mybookkeeper/api-client/utils/listingPhotoOrder";
import type { ListingPhoto } from "@mybookkeeper/api-client/types/listing/listing-photo";
import type { PhotoLightboxTarget } from "@/shared/types/listing/photo-lightbox-target";
import ListingPhotoCard from "@/app/features/listings/ListingPhotoCard";
import PhotoSelectionToolbar from "@/app/features/listings/PhotoSelectionToolbar";
import { usePhotoSelection } from "@/app/features/listings/usePhotoSelection";
import { downloadPhotosAsZip } from "@/app/features/listings/photo-bulk-download";
import { LISTING_MESSAGES } from "@/shared/lib/listing-messages";
import PhotoLightbox from "@/app/features/listings/PhotoLightbox";

export interface ListingPhotoManagerProps {
  listingId: string;
  listingSlug?: string;
  photos: readonly ListingPhoto[];
  /** Viewers can look at, select and download photos only. */
  canWrite: boolean;
}

function clientSideValidate(files: File[]): { valid: File[]; rejected: string[] } {
  const valid: File[] = [];
  const rejected: string[] = [];
  for (const f of files) {
    if (f.size > LISTING_PHOTO_MAX_BYTES) {
      rejected.push(`${f.name} is over ${LISTING_PHOTO_MAX_MB}MB`);
      continue;
    }
    // Some browsers don't set content-type for HEIC; fall back to extension check.
    const isHeicByExt = LISTING_PHOTO_HEIC_EXTENSION.test(f.name);
    if (!LISTING_PHOTO_MIME_TYPES.includes(f.type) && !isHeicByExt) {
      rejected.push(`${f.name} is not a supported image type`);
      continue;
    }
    valid.push(f);
  }
  return { valid, rejected };
}

export default function ListingPhotoManager({
  listingId,
  listingSlug,
  photos,
  canWrite,
}: ListingPhotoManagerProps) {
  const [uploadPhotos, { isLoading: isUploading }] = useUploadListingPhotosMutation();
  const dispatch = useDispatch();
  const [deletePhoto] = useDeleteListingPhotoMutation();
  const [reorderPhotos] = useReorderListingPhotosMutation();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [lightboxTarget, setLightboxTarget] = useState<PhotoLightboxTarget | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { selection, toggleSelection, selectAll, clearSelection, isSelected } =
    usePhotoSelection();

  const handleLightboxNavigate = useCallback((nextIndex: number) => {
    setLightboxTarget({ listingId, index: nextIndex });
  }, [listingId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortedPhotos = sortPhotos(photos);
  const displayIds = orderedIds ?? sortedPhotos.map((p) => p.id);
  const photosById = new Map(sortedPhotos.map((p) => [p.id, p]));

  const selectedCount = selection.selectedIds.size;
  const hasSelection = selectedCount > 0;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const { valid, rejected } = clientSideValidate(Array.from(files));
    if (rejected.length > 0) {
      showError(rejected.join("; "));
    }
    if (valid.length === 0) return;
    try {
      const form = new FormData();
      for (const file of valid) form.append("files", file);
      await uploadPhotos({ listingId, form }).unwrap();
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

  async function handleBulkDelete() {
    setConfirmBulkDelete(false);
    setIsBulkDeleting(true);
    const ids = Array.from(selection.selectedIds);
    let failedCount = 0;
    for (const photoId of ids) {
      try {
        await deletePhoto({ listingId, photoId, refresh: false }).unwrap();
      } catch {
        failedCount++;
        showError(`I couldn't remove photo ${photoId}. Stopped after the first failure.`);
        break;
      }
    }
    // The listing is read once for the whole batch, not after every photo.
    dispatch(listingsApi.util.invalidateTags([{ type: "Listing", id: listingId }]));
    setIsBulkDeleting(false);
    if (failedCount === 0) {
      showSuccess(ids.length === 1 ? "Photo removed." : `${ids.length} photos removed.`);
      clearSelection();
    }
  }

  async function handleBulkDownload() {
    setIsBulkDownloading(true);
    const selectedPhotos = displayIds
      .filter((id) => selection.selectedIds.has(id))
      .map((id) => photosById.get(id))
      .filter((p): p is ListingPhoto => p !== undefined);

    const slug = listingSlug ?? listingId;
    try {
      await downloadPhotosAsZip(selectedPhotos, slug);
    } catch {
      showError("I couldn't create the download. Want to try again?");
    } finally {
      setIsBulkDownloading(false);
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

    // One request sets the whole order, so a failure can't leave it half-applied.
    try {
      await reorderPhotos({ listingId, photoIds: newOrder }).unwrap();
    } catch (error) {
      if (writeFailure(error) === "conflict") {
        // The list this order was made from is out of date: show what is there now.
        dispatch(listingsApi.util.invalidateTags([{ type: "Listing", id: listingId }]));
        showError(LISTING_MESSAGES.photoOrderStale);
      } else {
        showError("I couldn't save the new order. Reverting.");
      }
      setOrderedIds(null);
    }
  }

  return (
    <div className="space-y-3" data-testid="listing-photo-manager">
      {canWrite ? (
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
      ) : null}

      {hasSelection ? (
        <PhotoSelectionToolbar
          selectedCount={selectedCount}
          totalCount={displayIds.length}
          onSelectAll={() => selectAll(displayIds)}
          onClear={clearSelection}
          onBulkDelete={canWrite ? () => setConfirmBulkDelete(true) : undefined}
          onBulkDownload={() => void handleBulkDownload()}
          isBulkDeleting={isBulkDeleting}
          isBulkDownloading={isBulkDownloading}
        />
      ) : null}

      {sortedPhotos.length === 0 ? (
        <p
          className="text-sm text-muted-foreground border rounded-lg p-6 text-center"
          data-testid="listing-photo-empty-state"
        >
          {canWrite ? LISTING_MESSAGES.noPhotos : LISTING_MESSAGES.noPhotosViewer}
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
              {displayIds.map((photoId, index) => {
                const photo = photosById.get(photoId);
                if (!photo) return null;
                return (
                  <ListingPhotoCard
                    key={photoId}
                    photo={photo}
                    onDelete={() => setConfirmDeleteId(photoId)}
                    selected={isSelected(photoId)}
                    onToggleSelection={(id, shiftKey) =>
                      toggleSelection(id, shiftKey, displayIds)
                    }
                    onOpen={() => setLightboxTarget({ listingId, index })}
                    canWrite={canWrite}
                  />
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {canWrite ? (
        <>
          <ConfirmDialog
            open={!!confirmDeleteId}
            title="Remove this photo?"
            description="The photo will be deleted from this listing. This can't be undone."
            confirmLabel="Remove"
            cancelLabel="Cancel"
            variant="danger"
            onConfirm={handleConfirmDelete}
            onCancel={() => setConfirmDeleteId(null)}
          />

          <ConfirmDialog
            open={confirmBulkDelete}
            title={`Delete ${selectedCount} photo${selectedCount === 1 ? "" : "s"}?`}
            description="These photos will be permanently deleted from this listing. This can't be undone."
            confirmLabel={`Delete ${selectedCount} photo${selectedCount === 1 ? "" : "s"}`}
            cancelLabel="Cancel"
            variant="danger"
            isLoading={isBulkDeleting}
            onConfirm={() => void handleBulkDelete()}
            onCancel={() => setConfirmBulkDelete(false)}
          />
        </>
      ) : null}

      {lightboxTarget ? (
        <PhotoLightbox
          photos={displayIds.map((id) => photosById.get(id)).filter((p): p is ListingPhoto => p !== undefined)}
          currentIndex={lightboxTarget.index}
          onClose={() => setLightboxTarget(null)}
          onNavigate={handleLightboxNavigate}
        />
      ) : null}
    </div>
  );
}
