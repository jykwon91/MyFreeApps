/**
 * MinimapPinEditor — draggable dual-pin minimap inset for the review queue.
 *
 * Renders a square minimap image with two draggable SVG pins:
 *   - Blue  (stand)  — where the player stands
 *   - Orange (target) — where the grenade lands
 *
 * Pin positions come from the operator-edited field strings (stand_anchor_x etc.)
 * falling back to lineup.effective_stand_x/y (pre-computed by the backend:
 * explicit anchor when set, zone-polygon centroid otherwise).
 *
 * A dashed ring marks pins showing the centroid/default fallback so the
 * operator knows those positions haven't been explicitly confirmed yet.
 *
 * MGA Tier 3 — intentionally NOT extracted to @platform/ui.
 * Deferred (not built here):
 *   - Sequential placement wizard for the no-centroid case
 *   - Expand-on-focus animation
 *   - Faint zone-polygon guide overlay
 *   - Hover <title> tooltip
 *   - useSvgDrag shared-hook extraction
 */
import { useRef, useState } from "react";
import type { Lineup } from "@/types/game";

// ---------------------------------------------------------------------------
// Constants — match MapLineupPins.tsx
// ---------------------------------------------------------------------------

const STAND_FILL = "#3b82f6"; // blue-500
const TARGET_FILL = "#f97316"; // orange-500
const VIEW_BOX = 1000; // same 1000×1000 coordinate space as MapLineupPins
const PIN_R = 10; // visual pin radius
const HIT_R = 36; // pointer-event hit area; undersized for ideal touch but
// forced by the small ~200-280px inset (project is "basic responsive only" —
// no mobile-specific UX per feedback_mobile_basic_responsive_only.md)
const DASHED_R = 20; // dashed "guess" ring radius
const LABEL_HIDE_THRESHOLD = 80; // hide labels when pins are this close in viewBox units

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve pin position in [0, 1] for a given axis from field string + effective fallback. */
function resolveCoord(
  fieldStr: string,
  effective: number | null,
): number {
  const v = parseFloat(fieldStr);
  if (!isNaN(v)) return v;
  if (effective != null) return effective;
  return 0.5;
}

/** True when the field is showing the centroid/default (operator hasn't explicitly set it). */
function isGuess(fieldStr: string, explicitAnchor: number | null): boolean {
  return fieldStr === "" && explicitAnchor == null;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MinimapPinEditorProps {
  lineup: Lineup;
  /** Resolved minimap image URL (MinIO URL or bundled fallback). Null = no image available. */
  minimapUrl: string | null;
  /** Current field values (string — empty means "use centroid"). */
  standAnchorX: string;
  standAnchorY: string;
  targetAnchorX: string;
  targetAnchorY: string;
  /** Called when the operator drags a pin to a new normalized [0,1] position. */
  onStandChange: (x: number, y: number) => void;
  onTargetChange: (x: number, y: number) => void;
  /** Called when the operator resets a pin to the centroid (sets field to ""). */
  onResetStand: () => void;
  onResetTarget: () => void;
  /** True while the accept request is in-flight; pins become non-interactive. */
  disabled: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MinimapPinEditor({
  lineup,
  minimapUrl,
  standAnchorX,
  standAnchorY,
  targetAnchorX,
  targetAnchorY,
  onStandChange,
  onTargetChange,
  onResetStand,
  onResetTarget,
  disabled,
}: MinimapPinEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<"stand" | "target" | null>(null);
  const [imgLoadFailed, setImgLoadFailed] = useState(false);

  // Resolved pin coordinates in [0, 1]
  const standX = resolveCoord(standAnchorX, lineup.effective_stand_x);
  const standY = resolveCoord(standAnchorY, lineup.effective_stand_y);
  const targetX = resolveCoord(targetAnchorX, lineup.effective_target_x);
  const targetY = resolveCoord(targetAnchorY, lineup.effective_target_y);

  // Guess flags
  const standIsGuess = isGuess(standAnchorX, lineup.stand_anchor_x);
  const targetIsGuess = isGuess(targetAnchorX, lineup.target_anchor_x);

  // ViewBox positions
  const svxStand = standX * VIEW_BOX;
  const svyStand = standY * VIEW_BOX;
  const svxTarget = targetX * VIEW_BOX;
  const svyTarget = targetY * VIEW_BOX;

  // Hide labels when the two pins are close together
  const pinDist = Math.hypot(svxStand - svxTarget, svyStand - svyTarget);
  const showLabels = pinDist > LABEL_HIDE_THRESHOLD;

  // Whether the reset buttons should be enabled
  const standResetEnabled = !disabled && standAnchorX !== "";
  const targetResetEnabled = !disabled && targetAnchorX !== "";

  // ---------------------------------------------------------------------------
  // SVG coordinate conversion
  // ---------------------------------------------------------------------------

  function svgCoordsFromPointer(e: React.PointerEvent<SVGSVGElement>): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const inv = ctm.inverse();
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(inv);
    const x = Math.max(0, Math.min(VIEW_BOX, local.x));
    const y = Math.max(0, Math.min(VIEW_BOX, local.y));
    return { x, y };
  }

  // ---------------------------------------------------------------------------
  // Pointer event handlers
  // ---------------------------------------------------------------------------

  function handlePointerDown(e: React.PointerEvent<SVGElement>, pin: "stand" | "target") {
    if (disabled) return;
    e.preventDefault();
    // Capture on the SVG element (not the <g>) so pointermove/up fire on the SVG.
    svgRef.current?.setPointerCapture(e.pointerId);
    setDragging(pin);
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragging || disabled) return;
    const coords = svgCoordsFromPointer(e);
    if (!coords) return;
    const nx = coords.x / VIEW_BOX;
    const ny = coords.y / VIEW_BOX;
    if (dragging === "stand") onStandChange(nx, ny);
    else onTargetChange(nx, ny);
  }

  function handlePointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragging || disabled) return;
    const coords = svgCoordsFromPointer(e);
    if (coords) {
      const nx = coords.x / VIEW_BOX;
      const ny = coords.y / VIEW_BOX;
      if (dragging === "stand") onStandChange(nx, ny);
      else onTargetChange(nx, ny);
    }
    (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
    setDragging(null);
  }

  // ---------------------------------------------------------------------------
  // Keyboard handlers for individual pin <g> elements
  // ---------------------------------------------------------------------------

  function handlePinKeyDown(
    e: React.KeyboardEvent<SVGGElement>,
    currentX: number,
    currentY: number,
    onChange: (x: number, y: number) => void,
  ) {
    if (disabled) return;

    const step = e.shiftKey ? 50 : 10; // viewBox units; Shift = 5%, plain = 1%
    let dx = 0;
    let dy = 0;

    switch (e.key) {
      case "ArrowLeft":  dx = -step; break;
      case "ArrowRight": dx = step;  break;
      case "ArrowUp":    dy = -step; break;
      case "ArrowDown":  dy = step;  break;
      case "Escape":
        (e.currentTarget as SVGGElement).blur();
        return;
      default:
        return;
    }

    e.preventDefault();
    const svx = currentX * VIEW_BOX + dx;
    const svy = currentY * VIEW_BOX + dy;
    const nx = Math.max(0, Math.min(1, svx / VIEW_BOX));
    const ny = Math.max(0, Math.min(1, svy / VIEW_BOX));
    onChange(nx, ny);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const showImage = minimapUrl != null && !imgLoadFailed;

  return (
    <div className="flex flex-col gap-2">
      {/* Square inset — max 280px, shrinks on narrow viewports */}
      <div
        className="relative rounded-lg overflow-hidden border bg-muted/20"
        style={{ maxWidth: 280, width: "100%", aspectRatio: "1 / 1" }}
      >
        {/* Minimap image */}
        {showImage ? (
          <img
            src={minimapUrl}
            alt="Map minimap"
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
            onError={() => setImgLoadFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            No minimap image
          </div>
        )}

        {/* SVG pin overlay */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
          className="absolute inset-0 w-full h-full"
          style={{
            touchAction: "none",
            cursor: dragging ? "grabbing" : "default",
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Stand pin (blue) */}
          <PinGroup
            x={svxStand}
            y={svyStand}
            fill={STAND_FILL}
            label="Stand"
            showLabel={showLabels}
            isGuess={standIsGuess}
            isDragging={dragging === "stand"}
            disabled={disabled}
            ariaLabel={`Stand pin — drag to reposition`}
            ariaValueText={`${standX.toFixed(2)}, ${standY.toFixed(2)}`}
            onPointerDown={(e) => handlePointerDown(e, "stand")}
            onKeyDown={(e) => handlePinKeyDown(e, standX, standY, onStandChange)}
          />

          {/* Target pin (orange) */}
          <PinGroup
            x={svxTarget}
            y={svyTarget}
            fill={TARGET_FILL}
            label="Target"
            showLabel={showLabels}
            isGuess={targetIsGuess}
            isDragging={dragging === "target"}
            disabled={disabled}
            ariaLabel={`Target pin — drag to reposition`}
            ariaValueText={`${targetX.toFixed(2)}, ${targetY.toFixed(2)}`}
            onPointerDown={(e) => handlePointerDown(e, "target")}
            onKeyDown={(e) => handlePinKeyDown(e, targetX, targetY, onTargetChange)}
          />
        </svg>
      </div>

      {/* Per-pin reset buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onResetStand}
          disabled={!standResetEnabled}
          className="flex-1 h-7 rounded border border-input bg-background px-2 text-xs text-muted-foreground disabled:opacity-40 hover:enabled:bg-muted/40 transition-colors"
          title="Undo — snap the stand pin back to the auto/default spot (you don't need this to save)"
        >
          Reset stand
        </button>
        <button
          type="button"
          onClick={onResetTarget}
          disabled={!targetResetEnabled}
          className="flex-1 h-7 rounded border border-input bg-background px-2 text-xs text-muted-foreground disabled:opacity-40 hover:enabled:bg-muted/40 transition-colors"
          title="Undo — snap the target pin back to the auto/default spot (you don't need this to save)"
        >
          Reset target
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PinGroup — one draggable SVG pin with dashed-ring guess affordance
// ---------------------------------------------------------------------------

interface PinGroupProps {
  x: number;
  y: number;
  fill: string;
  label: string;
  showLabel: boolean;
  isGuess: boolean;
  isDragging: boolean;
  disabled: boolean;
  ariaLabel: string;
  ariaValueText: string;
  onPointerDown: (e: React.PointerEvent<SVGElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<SVGGElement>) => void;
}

function PinGroup({
  x,
  y,
  fill,
  label,
  showLabel,
  isGuess,
  isDragging,
  disabled,
  ariaLabel,
  ariaValueText,
  onPointerDown,
  onKeyDown,
}: PinGroupProps) {
  return (
    <g
      tabIndex={disabled ? -1 : 0}
      role="slider"
      aria-label={ariaLabel}
      aria-valuetext={ariaValueText}
      style={{
        cursor: disabled ? "not-allowed" : isDragging ? "grabbing" : "grab",
        pointerEvents: disabled ? "none" : "auto",
        opacity: disabled ? 0.5 : 1,
        outline: "none",
      }}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      {/* Transparent hit area — larger than the visual pin for easier interaction */}
      <circle cx={x} cy={y} r={HIT_R} fill="transparent" />

      {/* Dashed ring — shown when the pin is showing the centroid/default fallback */}
      {isGuess && (
        <circle
          cx={x}
          cy={y}
          r={DASHED_R}
          fill="none"
          stroke={fill}
          strokeWidth={2}
          strokeDasharray="4 3"
          opacity={0.5}
        />
      )}

      {/* Solid pin circle */}
      <circle
        cx={x}
        cy={y}
        r={PIN_R}
        fill={fill}
        stroke="white"
        strokeWidth={2}
      />

      {/* Label — hidden when pins are too close together */}
      {showLabel && (
        <text
          x={x}
          y={y + PIN_R + 14}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill="white"
          style={{
            userSelect: "none",
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))",
          }}
        >
          {label}
        </text>
      )}
    </g>
  );
}
