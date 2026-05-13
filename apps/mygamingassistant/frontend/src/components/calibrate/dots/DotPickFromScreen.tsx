/**
 * DotPickFromScreen — orchestrates the click-on-the-screenshot color-pick flow.
 *
 * Renders only when `snapshot` is non-null. The operator clicks any pixel on
 * the screenshot; we sample a 3×3 region around that pixel via
 * `<canvas>.getImageData`, average the RGB, and suggest a tolerance via
 * `lib/calibration.suggestColorTolerance`.
 *
 * After the click, the snapshot disappears and the parent gets a single
 * `onPicked` callback. Picking a near-grey area (low saturation) surfaces
 * a toast hint instead of applying — the operator probably missed the dot.
 */
import { useEffect, useRef } from "react";
import { showError, showSuccess } from "@platform/ui";
import { suggestColorTolerance } from "@/lib/calibration";

interface DotPickFromScreenProps {
  /** Base64-encoded PNG of the full screen capture. */
  pngBase64: string;
  fullWidth: number;
  fullHeight: number;
  /** Region to crop to (so the click area matches what they're tuning for). */
  region: { x: number; y: number; width: number; height: number };
  onPicked: (rgb: [number, number, number], suggestedTolerance: number) => void;
  onCancel: () => void;
}

export default function DotPickFromScreen({
  pngBase64,
  fullWidth,
  fullHeight,
  region,
  onPicked,
  onCancel,
}: DotPickFromScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Render the cropped minimap region so the operator clicks on a familiar
  // sized image (not the entire 1920x1080 screenshot, which would force them
  // to hunt-and-peck).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (region.width <= 0 || region.height <= 0) return;
    const img = new Image();
    let cancelled = false;
    img.onload = () => {
      if (cancelled) return;
      const W = 320;
      const H = Math.round((W * region.height) / region.width);
      canvas.width = region.width;
      canvas.height = region.height;
      // Internally render at full resolution so `getImageData` reads
      // accurate pixel values, but display via CSS scaling.
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        img,
        region.x,
        region.y,
        region.width,
        region.height,
        0,
        0,
        region.width,
        region.height,
      );
    };
    img.src = `data:image/png;base64,${pngBase64}`;
    return () => {
      cancelled = true;
    };
  }, [pngBase64, fullWidth, fullHeight, region.x, region.y, region.width, region.height]);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    // Convert CSS pixel click → canvas internal pixel.
    const cx = Math.round(((e.clientX - rect.left) / rect.width) * canvas.width);
    const cy = Math.round(((e.clientY - rect.top) / rect.height) * canvas.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      showError("Couldn't sample pixel — canvas context unavailable.");
      return;
    }
    // 3×3 sample around the click point.
    const x0 = Math.max(0, cx - 1);
    const y0 = Math.max(0, cy - 1);
    const w = Math.min(3, canvas.width - x0);
    const h = Math.min(3, canvas.height - y0);
    let data: ImageData;
    try {
      data = ctx.getImageData(x0, y0, w, h);
    } catch (err) {
      showError(`Couldn't sample pixel: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    const samples: Array<[number, number, number]> = [];
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let i = 0; i < data.data.length; i += 4) {
      const r = data.data[i];
      const g = data.data[i + 1];
      const b = data.data[i + 2];
      samples.push([r, g, b]);
      sumR += r;
      sumG += g;
      sumB += b;
    }
    const n = samples.length;
    if (n === 0) return;
    const avg: [number, number, number] = [
      Math.round(sumR / n),
      Math.round(sumG / n),
      Math.round(sumB / n),
    ];
    // Reject low-saturation / near-grey picks — operator likely missed the dot.
    if (isLowSaturation(avg)) {
      showError(
        "That area looks empty — click directly on the dot, not the surrounding map.",
      );
      return;
    }
    const tolerance = suggestColorTolerance(samples, avg);
    onPicked(avg, tolerance);
    showSuccess(
      `Picked RGB(${avg[0]}, ${avg[1]}, ${avg[2]}) with tolerance ${tolerance}.`,
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium" aria-live="polite">
        Click your player dot on the minimap.
      </p>
      <p className="text-xs text-muted-foreground">
        We'll sample a 3×3 pixel area around the click and compute a target
        color + suggested tolerance. Click somewhere else to cancel.
      </p>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="cursor-crosshair rounded-md border bg-muted/20"
        aria-label="Cropped minimap — click your player dot"
      />
      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-muted-foreground underline"
      >
        Cancel
      </button>
    </div>
  );
}

/** Pixel is "near-grey" when the max-min channel spread is small. */
function isLowSaturation(rgb: [number, number, number]): boolean {
  const mx = Math.max(...rgb);
  const mn = Math.min(...rgb);
  return mx - mn < 20;
}
