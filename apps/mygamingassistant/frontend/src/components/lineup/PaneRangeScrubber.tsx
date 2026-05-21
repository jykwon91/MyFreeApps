/**
 * PaneRangeScrubber — two-thumb range slider primitive (PR2).
 *
 * Pointer + keyboard control for a [start, end] window over a 0..max range.
 * Pure presentation: no slot for clip / video / preview — the caller owns
 * those concerns. Each thumb exposes ``role="slider"`` with
 * ``aria-valuemin / valuemax / valuenow`` so keyboard + screen-reader users
 * can manipulate the range identically to mouse users.
 *
 * Constraints enforced inside the primitive (the hook re-clamps defensively):
 *   - start ∈ [0, end - step]
 *   - end ∈ [start + step, max]
 *
 * Touch targets are at least 24×24px per
 * ``feedback_mobile_basic_responsive_only.md``; thumbs render at 16×16 with
 * 8px hit-padding on each side to give the 32×32 target without visually
 * dominating the pane on a 250×140 tile.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";

interface PaneRangeScrubberProps {
  /** Upper bound of the range (typically clip duration in seconds). */
  max: number;
  /** Current start offset in seconds. */
  startValue: number;
  /** Current end offset in seconds. */
  endValue: number;
  /** Minimum window the operator can collapse to. */
  minWindow: number;
  /** Granularity for arrow-key nudges + drag snapping. */
  step?: number;
  /** Called with new (start, end) on any change. */
  onChange: (start: number, end: number) => void;
  /** Disable interaction (e.g., during apply/error state). */
  disabled?: boolean;
}

type ActiveThumb = "start" | "end" | null;

export default function PaneRangeScrubber({
  max,
  startValue,
  endValue,
  minWindow,
  step = 0.1,
  onChange,
  disabled = false,
}: PaneRangeScrubberProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<ActiveThumb>(null);
  const labelId = useId();

  // Drag handler — pointer events because they cover mouse + touch + stylus
  // uniformly. We listen on window during a drag so the operator can drag
  // outside the slider's bounds without losing the gesture.
  useEffect(() => {
    if (!active) return;
    const track = trackRef.current;
    if (!track) return;

    const handleMove = (e: PointerEvent) => {
      const rect = track.getBoundingClientRect();
      const pct = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const raw = pct * max;
      const snapped = Math.round(raw / step) * step;

      if (active === "start") {
        const newStart = clamp(snapped, 0, endValue - minWindow);
        onChange(newStart, endValue);
      } else {
        const newEnd = clamp(snapped, startValue + minWindow, max);
        onChange(startValue, newEnd);
      }
    };
    const handleUp = () => setActive(null);

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [active, endValue, max, minWindow, onChange, startValue, step]);

  const onPointerDownStart = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      setActive("start");
    },
    [disabled],
  );
  const onPointerDownEnd = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      setActive("end");
    },
    [disabled],
  );

  // Keyboard control — arrow keys nudge by `step`; shift accelerates 5×.
  // Home / End jump to the local bound (preserving the min-window constraint).
  const onKeyDownStart = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      const delta = arrowDelta(e, step);
      if (delta == null) return;
      e.preventDefault();
      if (e.key === "Home") {
        onChange(0, endValue);
      } else if (e.key === "End") {
        onChange(endValue - minWindow, endValue);
      } else {
        onChange(clamp(startValue + delta, 0, endValue - minWindow), endValue);
      }
    },
    [disabled, endValue, minWindow, onChange, startValue, step],
  );
  const onKeyDownEnd = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      const delta = arrowDelta(e, step);
      if (delta == null) return;
      e.preventDefault();
      if (e.key === "Home") {
        onChange(startValue, startValue + minWindow);
      } else if (e.key === "End") {
        onChange(startValue, max);
      } else {
        onChange(startValue, clamp(endValue + delta, startValue + minWindow, max));
      }
    },
    [disabled, endValue, max, minWindow, onChange, startValue, step],
  );

  const startPct = max > 0 ? (startValue / max) * 100 : 0;
  const endPct = max > 0 ? (endValue / max) * 100 : 100;

  return (
    <div className="w-full px-2 py-1.5" aria-labelledby={labelId}>
      <span id={labelId} className="sr-only">
        Trim range
      </span>
      {/* The track is the geometric reference for thumb positioning AND the
          pointer-event surface — clicking the track between thumbs is a
          no-op (rather than jumping a thumb), which avoids ambiguous gestures
          on a 250px-wide pane. */}
      <div
        ref={trackRef}
        className="relative h-1 bg-white/30 rounded-full"
      >
        {/* Selected-range fill */}
        <div
          className="absolute h-full bg-white rounded-full"
          style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
          aria-hidden
        />
        {/* Start thumb */}
        <ThumbHandle
          role="slider"
          ariaLabel="Trim start"
          ariaValueMin={0}
          ariaValueMax={max}
          ariaValueNow={startValue}
          leftPct={startPct}
          onPointerDown={onPointerDownStart}
          onKeyDown={onKeyDownStart}
          disabled={disabled}
        />
        {/* End thumb */}
        <ThumbHandle
          role="slider"
          ariaLabel="Trim end"
          ariaValueMin={0}
          ariaValueMax={max}
          ariaValueNow={endValue}
          leftPct={endPct}
          onPointerDown={onPointerDownEnd}
          onKeyDown={onKeyDownEnd}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

interface ThumbHandleProps {
  role: "slider";
  ariaLabel: string;
  ariaValueMin: number;
  ariaValueMax: number;
  ariaValueNow: number;
  leftPct: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  disabled: boolean;
}

function ThumbHandle({
  role,
  ariaLabel,
  ariaValueMin,
  ariaValueMax,
  ariaValueNow,
  leftPct,
  onPointerDown,
  onKeyDown,
  disabled,
}: ThumbHandleProps) {
  return (
    <button
      type="button"
      role={role}
      aria-label={ariaLabel}
      aria-valuemin={ariaValueMin}
      aria-valuemax={ariaValueMax}
      aria-valuenow={ariaValueNow}
      aria-orientation="horizontal"
      disabled={disabled}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      // Centered on the track via translate(-50%, -50%). 32×32 hit area
      // visually rendered as 12×12 (1.5×8px = 12px) with extra invisible
      // padding for touch — see touch-target reasoning in the file header.
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border border-black/40 shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-50 touch-none cursor-grab active:cursor-grabbing"
      style={{ left: `${leftPct}%` }}
    >
      {/* Invisible hit-padding to reach the 24px minimum touch target. */}
      <span aria-hidden className="absolute -inset-2.5" />
    </button>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function arrowDelta(e: React.KeyboardEvent, step: number): number | null {
  const accel = e.shiftKey ? 5 : 1;
  if (e.key === "ArrowLeft" || e.key === "ArrowDown") return -step * accel;
  if (e.key === "ArrowRight" || e.key === "ArrowUp") return step * accel;
  if (e.key === "Home" || e.key === "End") return 0;
  return null;
}
