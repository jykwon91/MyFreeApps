/**
 * useMinimapZoomPan — wheel-zoom + drag-pan for the pin-placement minimap.
 *
 * Pixel-precise pin placement needs more resolution than the ~280px inset
 * gives. This hook lets the operator scroll to zoom toward the cursor and drag
 * empty map area to pan, exposing a CSS transform applied to a wrapper that
 * holds BOTH the minimap <img> and the SVG pin overlay. Because the transform
 * sits on a shared ancestor, the SVG's getScreenCTM() still maps pointer →
 * viewBox correctly at any zoom, so pin dragging needs no zoom-aware math.
 *
 * Coordinates are kept in container pixels; the transform is
 * `translate(tx, ty) scale(s)` with transform-origin 0 0. Zoom-toward-cursor
 * holds the content point under the cursor fixed. Pan + zoom are both clamped
 * so the content always covers the container (no empty gutters).
 *
 * The wheel listener is attached natively with `{ passive: false }` — React's
 * synthetic onWheel is passive, so preventDefault() (needed to stop the page
 * scrolling while zooming the map) would be ignored.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const WHEEL_STEP = 0.0015; // scale delta per wheel unit (trackpads emit many small events)

interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

/**
 * A zoom + pan that survives a container resize: the translate is a fraction
 * of the container's size rather than pixels. `{ scale: 1, x: 0, y: 0 }` is unzoomed.
 */
export interface ZoomView {
  scale: number;
  x: number;
  y: number;
}

export const UNZOOMED: ZoomView = { scale: 1, x: 0, y: 0 };

export interface ZoomPanOptions {
  /** Every change of the zoom / pan, programmatic or not. */
  onChange?: (view: ZoomView) => void;
  /** The wheel changed the zoom (a person, never focusOn / setView / reset). */
  onWheelZoom?: () => void;
}

/** Clamp translate so the scaled content still covers the [0,size] container. */
function clampTranslate(t: number, scale: number, size: number): number {
  const min = size - size * scale; // most-negative (content right/bottom edge at container edge)
  if (min >= 0) return 0; // scale<=1: no pan
  return Math.max(min, Math.min(0, t));
}

function toView(t: Transform, r: { width: number; height: number }): ZoomView {
  return { scale: t.scale, x: r.width ? t.tx / r.width : 0, y: r.height ? t.ty / r.height : 0 };
}

export function useMinimapZoomPan(containerRef: React.RefObject<HTMLElement | null>, options: ZoomPanOptions = {}) {
  const [t, setT] = useState<Transform>({ scale: 1, tx: 0, ty: 0 });
  // Latest callbacks, read at event / effect time so they never re-attach listeners.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  const [panning, setPanning] = useState(false);
  const panState = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);
  // Mirror of `t` so the native wheel handler + pan-start (both fire at event
  // time, after commit) read the latest transform without re-attaching or
  // re-creating callbacks. Synced in an effect — never written during render.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
    const el = containerRef.current;
    if (!el) return;
    optionsRef.current.onChange?.(toView(t, el.getBoundingClientRect()));
  }, [t, containerRef]);

  // Native non-passive wheel listener (synthetic onWheel is passive → can't
  // preventDefault the page scroll).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      const r = el!.getBoundingClientRect();
      e.preventDefault();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      const prev = tRef.current;
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * (1 - e.deltaY * WHEEL_STEP)));
      if (next === prev.scale) return;
      // content point under cursor stays fixed: p = (c - translate)/scale
      const px = (cx - prev.tx) / prev.scale;
      const py = (cy - prev.ty) / prev.scale;
      const tx = clampTranslate(cx - px * next, next, r.width);
      const ty = clampTranslate(cy - py * next, next, r.height);
      setT({ scale: next, tx, ty });
      optionsRef.current.onWheelZoom?.();
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerRef]);

  // Begin a pan from an empty-map pointerdown (pins stopPropagation so they
  // never reach here). Returns true if a pan started (scale>1).
  const onPanStart = useCallback(
    (e: React.PointerEvent) => {
      if (tRef.current.scale <= 1) return false;
      panState.current = {
        startX: e.clientX,
        startY: e.clientY,
        startTx: tRef.current.tx,
        startTy: tRef.current.ty,
      };
      setPanning(true);
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      return true;
    },
    [],
  );

  const onPanMove = useCallback(
    (e: React.PointerEvent) => {
      const ps = panState.current;
      const el = containerRef.current;
      if (!ps || !el) return;
      const r = el.getBoundingClientRect();
      setT((prev) => ({
        scale: prev.scale,
        tx: clampTranslate(ps.startTx + (e.clientX - ps.startX), prev.scale, r.width),
        ty: clampTranslate(ps.startTy + (e.clientY - ps.startY), prev.scale, r.height),
      }));
    },
    [containerRef],
  );

  const onPanEnd = useCallback((e: React.PointerEvent) => {
    if (!panState.current) return;
    panState.current = null;
    setPanning(false);
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  }, []);

  const reset = useCallback(() => setT({ scale: 1, tx: 0, ty: 0 }), []);

  // Zoom to `scale` with the content point (fx, fy) — 0..1 of the content —
  // as close to the centre as the no-gutter clamp allows.
  const focusOn = useCallback(
    (fx: number, fy: number, scale: number) => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
      setT({
        scale: next,
        tx: clampTranslate(r.width / 2 - fx * r.width * next, next, r.width),
        ty: clampTranslate(r.height / 2 - fy * r.height * next, next, r.height),
      });
    },
    [containerRef],
  );

  /** Put back a view read from `onChange` (clamped to the current container). */
  const setView = useCallback(
    (view: ZoomView) => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale));
      setT({
        scale,
        tx: clampTranslate(view.x * r.width, scale, r.width),
        ty: clampTranslate(view.y * r.height, scale, r.height),
      });
    },
    [containerRef],
  );

  const transformStyle: React.CSSProperties = {
    transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.scale})`,
    transformOrigin: "0 0",
  };

  return {
    scale: t.scale,
    panning,
    transformStyle,
    onPanStart,
    onPanMove,
    onPanEnd,
    reset,
    focusOn,
    setView,
    isZoomed: t.scale > 1,
  };
}
