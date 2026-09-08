/**
 * PinGroup — one draggable SVG pin with dashed-ring guess affordance.
 *
 * Extracted from MinimapPinEditor so each file holds a single component.
 * The pin-geometry constants live here because nothing outside this component
 * reads them; the fill/viewBox constants stay with the editor, which uses them
 * for layout and label-collision maths.
 */
import type { KeyboardEvent, PointerEvent } from "react";

const PIN_R = 10; // visual pin radius
const HIT_R = 36; // pointer-event hit area; undersized for ideal touch but
// forced by the small ~200-280px inset (project is "basic responsive only" —
// no mobile-specific UX per feedback_mobile_basic_responsive_only.md)
const DASHED_R = 20; // dashed "guess" ring radius

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
  onPointerDown: (e: PointerEvent<SVGElement>) => void;
  onKeyDown: (e: KeyboardEvent<SVGGElement>) => void;
}

export function PinGroup({
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
  function cursor(): string {
    if (disabled) return "not-allowed";
    return isDragging ? "grabbing" : "grab";
  }

  return (
    <g
      tabIndex={disabled ? -1 : 0}
      role="slider"
      aria-label={ariaLabel}
      aria-valuetext={ariaValueText}
      style={{
        cursor: cursor(),
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
