import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import type { ListingPhoto } from "@/shared/types/listing/listing-photo";

export interface ListingPhotoCardProps {
  photo: ListingPhoto;
  onDelete: () => void;
}

export default function ListingPhotoCard({ photo, onDelete }: ListingPhotoCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="relative border rounded-lg overflow-hidden bg-card group"
      data-testid="listing-photo-card"
      data-photo-id={photo.id}
    >
      {/* Photo served via per-request presigned URL minted by the backend.
          Falls back to a labeled placeholder when storage is unavailable
          (e.g., MinIO outage) so the page still renders the layout. */}
      {photo.presigned_url ? (
        <img
          src={photo.presigned_url}
          alt={photo.caption ?? `Photo ${photo.display_order + 1}`}
          loading="lazy"
          className="aspect-square w-full object-cover bg-muted"
          data-testid="listing-photo-thumbnail"
        />
      ) : (
        <div
          className="aspect-square bg-muted flex items-center justify-center text-xs text-muted-foreground"
          data-testid="listing-photo-thumbnail"
        >
          Photo {photo.display_order + 1}
        </div>
      )}

      <button
        {...attributes}
        {...listeners}
        type="button"
        className="absolute top-1 left-1 bg-card/80 hover:bg-card border rounded p-1 cursor-grab active:cursor-grabbing min-h-[32px] min-w-[32px] flex items-center justify-center"
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
