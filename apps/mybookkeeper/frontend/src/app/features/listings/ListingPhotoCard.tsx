import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import type { ListingPhoto } from "@/shared/types/listing/listing-photo";
import PhotoSelectionCheckbox from "@/app/features/listings/PhotoSelectionCheckbox";

export interface ListingPhotoCardProps {
  photo: ListingPhoto;
  onDelete: () => void;
  onOpen: () => void;
  selected: boolean;
  onToggleSelection: (photoId: string, shiftKey: boolean) => void;
}

export default function ListingPhotoCard({
  photo,
  onDelete,
  onOpen,
  selected,
  onToggleSelection,
}: ListingPhotoCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const selectedBorder = selected ? "border-2 border-primary" : "border";

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`relative ${selectedBorder} rounded-lg overflow-hidden bg-card group`}
      data-testid="listing-photo-card"
      data-photo-id={photo.id}
    >
      <PhotoSelectionCheckbox
        photoId={photo.id}
        selected={selected}
        onToggle={onToggleSelection}
        photoIndex={photo.display_order}
      />

      {/* Photo served via per-request presigned URL minted by the backend.
          Falls back to a labeled placeholder when storage is unavailable
          (e.g., MinIO outage) so the page still renders the layout.
          Clicking opens the full-size lightbox viewer. */}
      {photo.presigned_url ? (
        <button
          type="button"
          onClick={onOpen}
          className="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`View photo ${photo.display_order + 1} full size`}
          data-testid="listing-photo-open-button"
        >
          <img
            src={photo.presigned_url}
            alt={photo.caption ?? `Photo ${photo.display_order + 1}`}
            loading="lazy"
            className="aspect-square w-full object-cover bg-muted hover:opacity-90 transition-opacity"
            data-testid="listing-photo-thumbnail"
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="aspect-square w-full bg-muted flex items-center justify-center text-xs text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`View photo ${photo.display_order + 1} full size`}
          data-testid="listing-photo-thumbnail"
        >
          Photo {photo.display_order + 1}
        </button>
      )}

      <button
        {...attributes}
        {...listeners}
        type="button"
        className="absolute top-1 right-8 bg-card/80 hover:bg-card border rounded p-1 cursor-grab active:cursor-grabbing min-h-[32px] min-w-[32px] flex items-center justify-center"
        aria-label={`Drag to reorder photo ${photo.display_order + 1}`}
        data-testid="listing-photo-drag-handle"
      >
        <GripVertical size={14} />
      </button>

      <button
        type="button"
        onClick={onDelete}
        className="absolute top-1 right-1 bg-card/80 hover:bg-red-100 border rounded p-1 min-h-[32px] min-w-[32px] flex items-center justify-center text-red-600"
        aria-label="Remove photo"
        data-testid="listing-photo-delete-button"
      >
        <X size={14} />
      </button>

      {photo.caption ? (
        <p className="px-2 py-1 text-xs text-muted-foreground truncate">
          {photo.caption}
        </p>
      ) : null}
    </li>
  );
}
