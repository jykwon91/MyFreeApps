import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import type { ListingPhoto } from "@/shared/types/listing/listing-photo";
import PhotoLightboxImage from "./PhotoLightboxImage";
import PhotoLightboxControls from "./PhotoLightboxControls";
import { usePhotoLightboxMode } from "./usePhotoLightboxMode";

export interface PhotoLightboxProps {
  photos: readonly ListingPhoto[];
  /** Index into `photos` of the currently displayed photo. */
  currentIndex: number;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
}

export default function PhotoLightbox({
  photos,
  currentIndex,
  onClose,
  onNavigate,
}: PhotoLightboxProps) {
  const photo = photos[currentIndex];
  const mode = usePhotoLightboxMode({ presignedUrl: photo?.presigned_url });

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) onNavigate(currentIndex - 1);
  }, [currentIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (currentIndex < photos.length - 1) onNavigate(currentIndex + 1);
  }, [currentIndex, photos.length, onNavigate]);

  // Keyboard navigation: Escape closes, arrow keys navigate.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, handlePrev, handleNext]);

  if (!photo) return null;

  const alt = photo.caption ?? `Photo ${currentIndex + 1}`;

  return createPortal(
    // Full-viewport dark backdrop — click outside the image to close.
    <div
      className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center"
      onClick={onClose}
      data-testid="photo-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
    >
      {/* Content container — stops click propagation so clicking the image
          itself does not close the modal. */}
      <div
        className="relative flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {mode === "image" ? (
          <PhotoLightboxImage src={photo.presigned_url!} alt={alt} />
        ) : (
          <div
            className="text-white text-sm bg-black/60 rounded px-4 py-3"
            data-testid="photo-lightbox-unavailable"
          >
            Photo unavailable
          </div>
        )}

        <PhotoLightboxControls
          currentIndex={currentIndex}
          total={photos.length}
          onClose={onClose}
          onPrev={handlePrev}
          onNext={handleNext}
        />
      </div>
    </div>,
    document.body,
  );
}
