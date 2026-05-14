/**
 * RegionCroppedPreview — "your minimap looks like this" preview.
 *
 * Renders just the rectangular slice of the captured screenshot defined by
 * the current region. ~280px wide; height scales with aspect ratio.
 */
import { useEffect, useRef, useState } from "react";
import type { CvCaptureRegion } from "@/types/desktop";

interface RegionCroppedPreviewProps {
  /** Base64-encoded PNG of the full screen capture. */
  pngBase64: string;
  /** Full screenshot dimensions. */
  fullWidth: number;
  fullHeight: number;
  /** Region to crop out. */
  region: CvCaptureRegion;
}

const PREVIEW_WIDTH = 280;

export default function RegionCroppedPreview({
  pngBase64,
  fullWidth,
  fullHeight,
  region,
}: RegionCroppedPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (region.width <= 0 || region.height <= 0) return;
    if (fullWidth <= 0 || fullHeight <= 0) return;

    let cancelled = false;

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const previewHeight = Math.round(
        (PREVIEW_WIDTH * region.height) / region.width,
      );
      canvas.width = PREVIEW_WIDTH;
      canvas.height = previewHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setError("Couldn't get 2D context for preview canvas.");
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        img,
        region.x,
        region.y,
        region.width,
        region.height,
        0,
        0,
        PREVIEW_WIDTH,
        previewHeight,
      );
      setError(null);
    };
    img.onerror = () => {
      setError("Couldn't decode captured screenshot.");
    };
    img.src = `data:image/png;base64,${pngBase64}`;

    return () => {
      cancelled = true;
    };
  }, [pngBase64, fullWidth, fullHeight, region.x, region.y, region.width, region.height]);

  if (region.width <= 0 || region.height <= 0) {
    return (
      <div className="rounded-md border-2 border-dashed border-muted-foreground/40 p-6 text-xs text-muted-foreground text-center">
        Click 4 corners to see the cropped preview.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">Cropped preview</p>
      <canvas
        ref={canvasRef}
        className="rounded-md border bg-muted/20 max-w-full"
        aria-label="Cropped minimap region preview"
      />
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
