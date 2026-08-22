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

/** Clamp translate so the scaled content still covers the [0,size] container. */
function clampTranslate(t: number, scale: number, size: number): number {
  const min = size - size * scale; // most-negative (content right/bottom edge at container edge)
  if (min >= 0) return 0; // scale<=1: no pan
  return Math.max(min, Math.min(0, t));
}

export function useMinimapZoomPan(containerRef: React.RefObject<HTMLElement | null>) {
  const [t, setT] = useState<Transform>({ scale: 1, tx: 0, ty: 0 });
  const [panning, setPanning] = useState(false);
  const panState = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);
  // Mirror of `t` so the native wheel handler + pan-start (both fire at event
  // time, after commit) read the latest transform without re-attaching or
  // re-creating callbacks. Synced in an effect — never written during render.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

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
    isZoomed: t.scale > 1,
  };
}
