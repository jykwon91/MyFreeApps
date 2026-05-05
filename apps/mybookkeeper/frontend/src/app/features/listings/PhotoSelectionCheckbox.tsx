export interface PhotoSelectionCheckboxProps {
  photoId: string;
  selected: boolean;
  onToggle: (photoId: string, shiftKey: boolean) => void;
  photoIndex: number;
}

export default function PhotoSelectionCheckbox({
  photoId,
  selected,
  onToggle,
  photoIndex,
}: PhotoSelectionCheckboxProps) {
  return (
    <div
      className="absolute top-1 left-1 z-10"
      // Stop click propagation so the checkbox area never opens the lightbox.
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => {}}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(photoId, e.shiftKey);
        }}
        className="cursor-pointer w-5 h-5 rounded accent-primary"
        aria-label={`Select photo ${photoIndex + 1}`}
        data-testid="listing-photo-checkbox"
        data-photo-id={photoId}
      />
    </div>
  );
}
