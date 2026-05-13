/**
 * RegionCornerPicker — click-to-mark the 4 minimap corners on a screenshot.
 *
 * Flow:
 *   1. Operator clicks "Capture screen" (in the parent panel) — we receive a
 *      base64 PNG via `snapshot`.
 *   2. They click 4 times on the screenshot: TL → TR → BR → BL.
 *   3. We compute the axis-aligned bounding rect via min/max, overlay a
 *      yellow translucent rect, and surface the rect via `onCorners`.
 *   4. Markers are draggable. Arrow keys nudge the focused marker 1px;
 *      shift+arrow = 10px.
 *
 * Numeric fallback: parent toggles a "use numeric inputs instead" mode and
 * passes `mode='numeric'` to swap this view for `<RegionNumericFallback>`.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const CORNER_LABELS = ["top-left", "top-right", "bottom-right", "bottom-left"] as const;

export interface CornerPoint {
  x: number;
  y: number;
}

interface RegionCornerPickerProps {
  /** Base64-encoded PNG to render under the picker. */
  pngBase64: string;
  /** Width of the full screenshot, in screen pixels. */
  fullWidth: number;
  /** Height of the full screenshot, in screen pixels. */
  fullHeight: number;
  /** Current corner coordinates, in screen pixels. */
  corners: CornerPoint[];
  /** Called on every change (drag, click, keyboard nudge). */
  onCornersChange: (corners: CornerPoint[]) => void;
}

export default function RegionCornerPicker({
  pngBase64,
  fullWidth,
  fullHeight,
  corners,
  onCornersChange,
}: RegionCornerPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  // Drag state. We track which marker is being dragged + the pointer's
  // last-seen screen-pixel coordinate.
  const dragStateRef = useRef<{ index: number } | null>(null);

  const screenFromEvent = useCallback(
    (clientX: number, clientY: number): CornerPoint | null => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      // Convert client coords → screen-pixel coords by scaling against the
      // container's rendered size vs the full screenshot's dimensions.
      const fx = (clientX - rect.left) / rect.width;
      const fy = (clientY - rect.top) / rect.height;
      return {
        x: Math.max(0, Math.min(fullWidth, Math.round(fx * fullWidth))),
        y: Math.max(0, Math.min(fullHeight, Math.round(fy * fullHeight))),
      };
    },
    [fullWidth, fullHeight],
  );

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (corners.length >= 4) return; // No-op once all 4 placed
    if (dragStateRef.current) return; // Don't double-fire after drag-end
    const pt = screenFromEvent(e.clientX, e.clientY);
    if (!pt) return;
    onCornersChange([...corners, pt]);
  }

  function handleMarkerPointerDown(
    e: React.PointerEvent<HTMLButtonElement>,
    index: number,
  ) {
    e.stopPropagation();
    dragStateRef.current = { index };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleMarkerPointerMove(
    e: React.PointerEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (!dragStateRef.current || dragStateRef.current.index !== index) return;
    const pt = screenFromEvent(e.clientX, e.clientY);
    if (!pt) return;
    const next = corners.slice();
    next[index] = pt;
    onCornersChange(next);
  }

  function handleMarkerPointerUp(
    e: React.PointerEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (dragStateRef.current?.index === index) {
      dragStateRef.current = null;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore — already released
      }
    }
  }

  function nudgeMarker(index: number, dx: number, dy: number) {
    if (index < 0 || index >= corners.length) return;
    const next = corners.slice();
    next[index] = {
      x: Math.max(0, Math.min(fullWidth, next[index].x + dx)),
      y: Math.max(0, Math.min(fullHeight, next[index].y + dy)),
    };
    onCornersChange(next);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (focusIndex === null) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudgeMarker(focusIndex, -step, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudgeMarker(focusIndex, step, 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        nudgeMarker(focusIndex, 0, -step);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nudgeMarker(focusIndex, 0, step);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIndex, corners]);

  // Bounding rect overlay — only shown when we have all 4 corners.
  const overlay = computeOverlayPercent(corners, fullWidth, fullHeight);

  const nextCornerLabel =
    corners.length < CORNER_LABELS.length ? CORNER_LABELS[corners.length] : null;

  return (
    <div className="space-y-2">
      <p
        className="text-sm text-muted-foreground"
        data-testid="region-instruction"
      >
        {nextCornerLabel ? (
          <>
            Click the <strong>{nextCornerLabel}</strong> corner of the minimap.
            <span className="ml-2 text-xs opacity-70">
              {corners.length}/4 placed
            </span>
          </>
        ) : (
          <>All four corners placed. Drag or use arrow keys to fine-tune.</>
        )}
      </p>
      <div
        ref={containerRef}
        onClick={handleCanvasClick}
        className="relative overflow-hidden rounded-md border bg-muted/20"
        style={{
          aspectRatio: `${fullWidth} / ${fullHeight}`,
        }}
        role="application"
        aria-label="Click the four corners of your minimap"
        data-testid="region-corner-canvas"
      >
        <img
          src={`data:image/png;base64,${pngBase64}`}
          alt="Screen capture"
          className="absolute inset-0 w-full h-full select-none pointer-events-none"
          draggable={false}
        />
        {overlay && (
          <div
            className="absolute bg-yellow-400/20 border-2 border-yellow-400 pointer-events-none"
            style={{
              left: `${overlay.left}%`,
              top: `${overlay.top}%`,
              width: `${overlay.width}%`,
              height: `${overlay.height}%`,
            }}
            data-testid="region-overlay-rect"
          />
        )}
        {corners.map((c, i) => (
          <button
            key={i}
            type="button"
            onPointerDown={(e) => handleMarkerPointerDown(e, i)}
            onPointerMove={(e) => handleMarkerPointerMove(e, i)}
            onPointerUp={(e) => handleMarkerPointerUp(e, i)}
            onFocus={() => setFocusIndex(i)}
            onBlur={() => setFocusIndex((cur) => (cur === i ? null : cur))}
            className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 border-white bg-blue-600 text-white text-xs font-semibold shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            style={{
              left: `${(c.x / fullWidth) * 100}%`,
              top: `${(c.y / fullHeight) * 100}%`,
              touchAction: "none",
            }}
            aria-label={`Corner ${i + 1}: x=${c.x}, y=${c.y}. Drag or use arrow keys.`}
            data-testid={`region-corner-marker-${i}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      {corners.length === 4 && overlay && (
        <p className="text-xs font-mono text-muted-foreground">
          Region: x={overlay.regionX}, y={overlay.regionY}, w={overlay.regionWidth}, h=
          {overlay.regionHeight}
        </p>
      )}
    </div>
  );
}

/**
 * Compute the bounding rect overlay (in % of canvas dimensions for CSS) plus
 * raw pixel coords for the readout. Returns null until all 4 corners present.
 */
function computeOverlayPercent(
  corners: CornerPoint[],
  fullWidth: number,
  fullHeight: number,
): {
  left: number;
  top: number;
  width: number;
  height: number;
  regionX: number;
  regionY: number;
  regionWidth: number;
  regionHeight: number;
} | null {
  if (corners.length < 4) return null;
  if (fullWidth <= 0 || fullHeight <= 0) return null;
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    left: (minX / fullWidth) * 100,
    top: (minY / fullHeight) * 100,
    width: ((maxX - minX) / fullWidth) * 100,
    height: ((maxY - minY) / fullHeight) * 100,
    regionX: minX,
    regionY: minY,
    regionWidth: maxX - minX,
    regionHeight: maxY - minY,
  };
}
