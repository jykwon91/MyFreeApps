/**
 * ReviewScreenshot — screenshot with lightbox toggle and optional interactive
 * aim anchor. When `interactive` is true, clicking the image fires
 * `onAnchorChange(x, y)` with normalized 0-1 coordinates.
 */
import { useCallback, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";

export interface ReviewScreenshotProps {
  src: string | null;
  alt: string;
  aimAnchorX?: number | null;
  aimAnchorY?: number | null;
  interactive?: boolean;
  onAnchorChange?: (x: number, y: number) => void;
}

export default function ReviewScreenshot({
  src,
  alt,
  aimAnchorX,
  aimAnchorY,
  interactive = false,
  onAnchorChange,
}: ReviewScreenshotProps) {
  const [lightbox, setLightbox] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!interactive || !onAnchorChange || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      onAnchorChange(
        Math.max(0, Math.min(1, x)),
        Math.max(0, Math.min(1, y)),
      );
    },
    [interactive, onAnchorChange],
  );

  return (
    <>
      <div
        ref={containerRef}
        className={`relative rounded-md overflow-hidden bg-muted/20 aspect-video group ${
          interactive ? "cursor-crosshair" : ""
        }`}
        onClick={interactive ? handleContainerClick : undefined}
      >
        {src ? (
          <img
            src={src}
            alt={alt}
            className="w-full h-full object-cover select-none"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
            No screenshot
          </div>
        )}

        {/* Aim anchor dot */}
        {aimAnchorX != null && aimAnchorY != null && src && (
          <div
            aria-label={`Aim anchor at ${Math.round(aimAnchorX * 100)}%, ${Math.round(aimAnchorY * 100)}%`}
            style={{
              position: "absolute",
              left: `calc(${aimAnchorX * 100}% - 8px)`,
              top: `calc(${aimAnchorY * 100}% - 8px)`,
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: "2px solid rgba(239, 68, 68, 0.9)",
              background: "rgba(239, 68, 68, 0.3)",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
              pointerEvents: "none",
            }}
          />
        )}

        {/* Expand icon (on hover) */}
        {src && (
          <button
            type="button"
            aria-label="Enlarge screenshot"
            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 rounded p-0.5"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(true);
            }}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && src && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightbox(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot enlarged"
        >
          <img
            src={src}
            alt={alt}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
