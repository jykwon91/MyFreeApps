import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface PhotoLightboxControlsProps {
  currentIndex: number;
  total: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export default function PhotoLightboxControls({
  currentIndex,
  total,
  onClose,
  onPrev,
  onNext,
}: PhotoLightboxControlsProps) {
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < total - 1;

  return (
    <>
      {/* Close button — top-right */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 z-10 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white min-h-[44px] min-w-[44px] transition-colors"
        aria-label="Close photo viewer"
        data-testid="photo-lightbox-close"
      >
        <X size={20} />
      </button>

      {/* Image counter — bottom-center */}
      <div
        className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 rounded-full bg-black/60 text-white text-sm px-3 py-1 tabular-nums"
        data-testid="photo-lightbox-counter"
        aria-live="polite"
        aria-label={`Photo ${currentIndex + 1} of ${total}`}
      >
        {currentIndex + 1} / {total}
      </div>

      {/* Prev arrow */}
      {hasPrev && (
        <button
          type="button"
          onClick={onPrev}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white min-h-[44px] min-w-[44px] transition-colors"
          aria-label="Previous photo"
          data-testid="photo-lightbox-prev"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {/* Next arrow */}
      {hasNext && (
        <button
          type="button"
          onClick={onNext}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white min-h-[44px] min-w-[44px] transition-colors"
          aria-label="Next photo"
          data-testid="photo-lightbox-next"
        >
          <ChevronRight size={24} />
        </button>
      )}
    </>
  );
}
