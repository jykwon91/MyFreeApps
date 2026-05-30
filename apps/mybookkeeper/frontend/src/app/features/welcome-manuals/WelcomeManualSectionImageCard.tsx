import { useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { reportMissingStorageObject } from "@/shared/lib/storage-observability";
import { SECTION_IMAGE_STORAGE_DOMAIN } from "@/shared/lib/welcome-manual-constants";
import type { WelcomeManualSectionImageResponse } from "@/shared/types/welcome-manual/welcome-manual-section-image-response";

export interface WelcomeManualSectionImageCardProps {
  image: WelcomeManualSectionImageResponse;
  onDelete: () => void;
  onOpen: () => void;
  onCaptionSave: (caption: string) => void;
}

export default function WelcomeManualSectionImageCard({
  image,
  onDelete,
  onOpen,
  onCaptionSave,
}: WelcomeManualSectionImageCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isMissing = image.is_available === false;

  useEffect(() => {
    if (!isMissing) return;
    reportMissingStorageObject({
      domain: SECTION_IMAGE_STORAGE_DOMAIN,
      attachment_id: image.id,
      storage_key: image.storage_key,
      parent_id: image.section_id,
      parent_kind: "welcome_manual_section",
    });
  }, [isMissing, image.id, image.storage_key, image.section_id]);

  function handleCaptionBlur(e: React.FocusEvent<HTMLInputElement>) {
    const trimmed = e.target.value.trim();
    if (trimmed === (image.caption ?? "")) return;
    onCaptionSave(trimmed);
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="relative border rounded-lg overflow-hidden bg-card group"
      data-testid="welcome-manual-image-card"
      data-image-id={image.id}
    >
      {!isMissing && image.presigned_url ? (
        <button
          type="button"
          onClick={onOpen}
          className="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`View image ${image.display_order + 1} full size`}
          data-testid="welcome-manual-image-open-button"
        >
          <img
            src={image.presigned_url}
            alt={image.caption ?? `Image ${image.display_order + 1}`}
            loading="lazy"
            className="aspect-square w-full object-cover bg-muted hover:opacity-90 transition-opacity"
            data-testid="welcome-manual-image-thumbnail"
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="aspect-square w-full flex items-center justify-center text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-ring bg-muted text-muted-foreground"
          aria-label={`View image ${image.display_order + 1} full size`}
          data-testid="welcome-manual-image-thumbnail"
        >
          Image {image.display_order + 1}
        </button>
      )}

      <button
        {...attributes}
        {...listeners}
        type="button"
        className="absolute top-1 right-8 bg-card/80 hover:bg-card border rounded p-1 cursor-grab active:cursor-grabbing min-h-[32px] min-w-[32px] flex items-center justify-center"
        aria-label={`Drag to reorder image ${image.display_order + 1}`}
        data-testid="welcome-manual-image-drag-handle"
      >
        <GripVertical size={14} />
      </button>

      <button
        type="button"
        onClick={onDelete}
        className="absolute top-1 right-1 bg-card/80 hover:bg-red-100 border rounded p-1 min-h-[32px] min-w-[32px] flex items-center justify-center text-red-600"
        aria-label="Remove image"
        data-testid="welcome-manual-image-delete-button"
      >
        <X size={14} />
      </button>

      {/* Uncontrolled: ``key`` re-mounts the input when the server caption
          changes (after a successful save or a revert) so the displayed value
          re-baselines without a setState-in-effect. Edits live in the DOM and
          are read on blur. */}
      <input
        key={image.caption ?? ""}
        defaultValue={image.caption ?? ""}
        onBlur={handleCaptionBlur}
        placeholder="Add a caption…"
        className="w-full border-t px-2 py-1 text-xs bg-transparent focus:outline-none focus:bg-muted/40"
        aria-label="Image caption"
        data-testid="welcome-manual-image-caption"
      />
    </li>
  );
}
