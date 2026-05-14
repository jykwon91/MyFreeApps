/**
 * ZoneEditorCanvas — SVG-based polygon editor.
 *
 * Modes:
 *   - `idle`        — hover highlights polygon under cursor; click selects.
 *   - `select`      — drag body translates polygon; drag vertex moves it.
 *   - `add-vertex`  — click on an edge inserts a vertex at that position.
 *   - `new`         — click empty canvas starts a polygon; subsequent clicks
 *                     add vertices; click first vertex (8px hit zone) or
 *                     press `enter` closes; `esc` cancels.
 *
 * Coordinates: polygons are stored in 0-1 normalized world space. The SVG
 * viewport is 100 × 100 so we render in percent units — no per-tick zoom
 * math. Pointer events go through `clientFromScreen` to get back into
 * world coords.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CvZonePolygon } from "@/types/desktop";

export type EditorMode = "idle" | "select" | "add-vertex" | "new";

export interface ZoneEditorCanvasProps {
  /** Underlying background — the cropped minimap snapshot (base64 PNG) OR a
   *  reference radar image URL when no snapshot is available. */
  backgroundSrc: string | null;
  /** True when the background is a fallback reference image (not the
   *  user's actual screen capture). Surfaces a warning chip. */
  backgroundIsFallback: boolean;
  zones: CvZonePolygon[];
  selectedSlug: string | null;
  mode: EditorMode;
  /** Slug currently being drawn (mode='new'); null when not drawing. */
  drawingSlug: string | null;
  /** Vertices of the currently-being-drawn polygon (mode='new'). Normalized 0-1. */
  drawingPoints: Array<[number, number]>;
  /** Width of the canvas in pixels (used to render handles at correct size). */
  canvasWidthPx?: number;
  onSelectZone: (slug: string | null) => void;
  /** Replace the entire polygon's points (after drag or add-vertex). */
  onUpdateZonePoints: (slug: string, points: Array<[number, number]>) => void;
  /** Append a vertex to the in-progress new polygon. */
  onAppendNewVertex: (point: [number, number]) => void;
  /** Close the in-progress new polygon. */
  onCloseNewPolygon: () => void;
}

const VERTEX_HIT_RADIUS_PCT = 1.5;

export default function ZoneEditorCanvas({
  backgroundSrc,
  backgroundIsFallback,
  zones,
  selectedSlug,
  mode,
  drawingSlug,
  drawingPoints,
  onSelectZone,
  onUpdateZonePoints,
  onAppendNewVertex,
  onCloseNewPolygon,
}: ZoneEditorCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<
    | { kind: "vertex"; slug: string; index: number }
    | { kind: "body"; slug: string; lastWorldX: number; lastWorldY: number }
    | null
  >(null);
  const [hoverSlug, setHoverSlug] = useState<string | null>(null);

  const selected = useMemo(
    () => zones.find((z) => z.slug === selectedSlug) ?? null,
    [zones, selectedSlug],
  );

  function worldFromEvent(e: { clientX: number; clientY: number }): [number, number] | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const wx = (e.clientX - rect.left) / rect.width;
    const wy = (e.clientY - rect.top) / rect.height;
    return [clamp01(wx), clamp01(wy)];
  }

  function handleCanvasClick(e: React.MouseEvent<SVGSVGElement>) {
    const pt = worldFromEvent(e);
    if (!pt) return;
    if (mode === "new") {
      // Click within 1.5% of the first vertex closes the polygon.
      if (drawingPoints.length >= 3) {
        const [fx, fy] = drawingPoints[0];
        if (distance2d([fx, fy], pt) < VERTEX_HIT_RADIUS_PCT / 100) {
          onCloseNewPolygon();
          return;
        }
      }
      onAppendNewVertex(pt);
      return;
    }
    if (mode === "add-vertex" && selected) {
      const slug = selected.slug;
      const idx = closestEdgeIndex(selected.points, pt);
      if (idx >= 0) {
        const next = [...selected.points];
        next.splice(idx + 1, 0, pt);
        onUpdateZonePoints(slug, next);
      }
      return;
    }
    if (mode === "idle" || mode === "select") {
      const hit = findZoneAt(zones, pt);
      onSelectZone(hit);
    }
  }

  function handleVertexPointerDown(
    e: React.PointerEvent<SVGCircleElement>,
    slug: string,
    index: number,
  ) {
    if (mode !== "select") return;
    e.stopPropagation();
    dragStateRef.current = { kind: "vertex", slug, index };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function handleBodyPointerDown(e: React.PointerEvent<SVGPolygonElement>, slug: string) {
    if (mode !== "select") return;
    if (slug !== selectedSlug) return;
    e.stopPropagation();
    const pt = worldFromEvent(e);
    if (!pt) return;
    dragStateRef.current = {
      kind: "body",
      slug,
      lastWorldX: pt[0],
      lastWorldY: pt[1],
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragStateRef.current) return;
    const pt = worldFromEvent(e);
    if (!pt) return;
    const ds = dragStateRef.current;
    if (ds.kind === "vertex") {
      const z = zones.find((z) => z.slug === ds.slug);
      if (!z) return;
      const next = z.points.map((p, i): [number, number] =>
        i === ds.index ? pt : p,
      );
      onUpdateZonePoints(ds.slug, next);
    } else {
      const z = zones.find((z) => z.slug === ds.slug);
      if (!z) return;
      const dx = pt[0] - ds.lastWorldX;
      const dy = pt[1] - ds.lastWorldY;
      const next = z.points.map((p): [number, number] => [
        clamp01(p[0] + dx),
        clamp01(p[1] + dy),
      ]);
      onUpdateZonePoints(ds.slug, next);
      ds.lastWorldX = pt[0];
      ds.lastWorldY = pt[1];
    }
  }

  function handlePointerUp() {
    dragStateRef.current = null;
  }

  // Arrow-key vertex nudge for selected zone. 1px ≈ 0.002 in 0-1 space at
  // 500px canvas — fine for vertex nudging. Shift-arrow = 10x.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (mode !== "select" || !selectedSlug) return;
      if (!selected) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      const step = e.shiftKey ? 0.02 : 0.002;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else return;
      e.preventDefault();
      // Move the entire polygon by the step. To nudge a specific vertex, the
      // operator must drag — keyboard nudge is for translation.
      const next = selected.points.map((p): [number, number] => [
        clamp01(p[0] + dx),
        clamp01(p[1] + dy),
      ]);
      onUpdateZonePoints(selectedSlug, next);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode, selectedSlug, selected, onUpdateZonePoints]);

  return (
    <div className="space-y-2">
      {backgroundIsFallback && (
        <div className="text-xs px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300">
          Showing reference image — capture your screen in the Region tab for
          accurate calibration.
        </div>
      )}
      <div
        className="relative rounded-md border bg-muted/20 overflow-hidden"
        style={{ aspectRatio: "1 / 1" }}
      >
        {backgroundSrc && (
          <img
            src={backgroundSrc}
            alt="Calibrated minimap"
            className="absolute inset-0 w-full h-full select-none pointer-events-none"
            draggable={false}
          />
        )}
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute inset-0 w-full h-full focus-visible:outline-2 focus-visible:outline-blue-500 cursor-crosshair"
          role="application"
          aria-label="Polygon editor for zone calibration"
          tabIndex={0}
          onClick={handleCanvasClick}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {zones.map((z) => (
            <ZonePolygonShape
              key={z.slug}
              zone={z}
              isSelected={z.slug === selectedSlug}
              isHovered={z.slug === hoverSlug}
              onPointerDown={(e) => handleBodyPointerDown(e, z.slug)}
              onPointerEnter={() => setHoverSlug(z.slug)}
              onPointerLeave={() => setHoverSlug(null)}
            />
          ))}

          {/* Vertex handles for the selected polygon. Drawn AFTER all
              polygons so they're always on top of zone fills. */}
          {selected && mode === "select" && (
            <g>
              {selected.points.map((p, i) => (
                <circle
                  key={i}
                  cx={p[0] * 100}
                  cy={p[1] * 100}
                  r={1.0}
                  className="fill-white stroke-blue-600 cursor-grab"
                  strokeWidth={0.5}
                  role="slider"
                  aria-label={`Vertex ${i + 1} of ${selected.name}`}
                  aria-valuetext={`x=${p[0].toFixed(3)}, y=${p[1].toFixed(3)}`}
                  onPointerDown={(e) => handleVertexPointerDown(e, selected.slug, i)}
                  style={{ touchAction: "none" }}
                />
              ))}
            </g>
          )}

          {/* In-progress new polygon — render as polyline. */}
          {mode === "new" && drawingPoints.length > 0 && (
            <g>
              <polyline
                points={drawingPoints.map((p) => `${p[0] * 100},${p[1] * 100}`).join(" ")}
                fill="none"
                stroke="#fb923c"
                strokeWidth={0.4}
                strokeDasharray="1,0.5"
              />
              {drawingPoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p[0] * 100}
                  cy={p[1] * 100}
                  r={0.8}
                  className={i === 0 ? "fill-orange-300 stroke-orange-700" : "fill-white stroke-orange-600"}
                  strokeWidth={0.3}
                />
              ))}
              {drawingSlug && drawingPoints[0] && (
                <text
                  x={drawingPoints[0][0] * 100 + 1.5}
                  y={drawingPoints[0][1] * 100 - 0.5}
                  fontSize={2}
                  fill="#7c2d12"
                  className="select-none"
                >
                  {drawingSlug}
                </text>
              )}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

interface ZonePolygonShapeProps {
  zone: CvZonePolygon;
  isSelected: boolean;
  isHovered: boolean;
  onPointerDown: (e: React.PointerEvent<SVGPolygonElement>) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

function ZonePolygonShape({
  zone,
  isSelected,
  isHovered,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
}: ZonePolygonShapeProps) {
  const fill = colorForSlug(zone.slug);
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${zone.name} polygon, ${zone.points.length} vertices`}
    >
      {/* Black halo for high-contrast outline */}
      <polygon
        points={zone.points.map((p) => `${p[0] * 100},${p[1] * 100}`).join(" ")}
        fill="transparent"
        stroke="#000"
        strokeWidth={isSelected ? 1.2 : 0.7}
        strokeOpacity={0.6}
        pointerEvents="none"
      />
      <polygon
        points={zone.points.map((p) => `${p[0] * 100},${p[1] * 100}`).join(" ")}
        fill={fill}
        fillOpacity={isSelected ? 0.35 : isHovered ? 0.25 : 0.15}
        stroke="#fff"
        strokeWidth={isSelected ? 0.7 : 0.45}
        onPointerDown={onPointerDown}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        className="cursor-grab"
        style={{ touchAction: "none" }}
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function distance2d(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/** Find the index of the edge closest to `pt`. Returns the index of the
 *  edge's START vertex; caller inserts the new vertex at `index + 1`. */
function closestEdgeIndex(
  points: Array<[number, number]>,
  pt: [number, number],
): number {
  if (points.length < 2) return -1;
  let bestIdx = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const d = distanceToSegment(pt, a, b);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function distanceToSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance2d(p, a);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  const fx = a[0] + t * dx;
  const fy = a[1] + t * dy;
  return distance2d(p, [fx, fy]);
}

/** Mirror of `lib/calibration.pointInPolygon` for hit testing. */
function findZoneAt(
  zones: CvZonePolygon[],
  pt: [number, number],
): string | null {
  for (const z of zones) {
    if (pointInPolygonLocal(pt[0], pt[1], z.points)) return z.slug;
  }
  return null;
}

function pointInPolygonLocal(
  px: number,
  py: number,
  points: Array<[number, number]>,
): boolean {
  if (points.length < 3) return false;
  let inside = false;
  let j = points.length - 1;
  for (let i = 0; i < points.length; i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > py) !== (yj > py)) {
      const xInt = xi + ((py - yi) * (xj - xi)) / (yj - yi);
      if (px < xInt) inside = !inside;
    }
    j = i;
  }
  return inside;
}

const FILL_PALETTE = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
  "#84cc16", // lime
];

function colorForSlug(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) & 0xffffffff;
  }
  return FILL_PALETTE[Math.abs(hash) % FILL_PALETTE.length];
}

export const ZONE_FILL_PALETTE = FILL_PALETTE;
