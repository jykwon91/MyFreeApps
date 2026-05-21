/**
 * LineupPanes — shared pane primitives for the 4-pane lineup storyboard.
 *
 * Both GlanceBoardTile (glance-board surface) and LineupCard (detail-panel
 * surface) render the same 2×2 grid: STAND (still), AIM (still + anchor),
 * THROW (clip loop or empty state), LANDING (text card until PR5).
 *
 * Extracted here so the two surfaces stay byte-equivalent — if the throw-
 * pane behavior or the landing pane content evolves in PR5/PR6 we change
 * it once and both surfaces follow. None of these primitives manage their
 * own grid; the caller arranges them inside a flex row container.
 */
import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Aim anchor dot — 12px red filled circle, white outline, drop shadow.
//
// Positioned via CSS-absolute at (x*width, y*height) within an aspect-video
// pane. Receives normalized coords (0..1). Use as a child of ScreenshotHalf
// inside the AIM pane only.
// ---------------------------------------------------------------------------
export function AimAnchorDot({ x, y }: { x: number; y: number }) {
  return (
    <div
      aria-label={`Aim anchor at ${Math.round(x * 100)}%, ${Math.round(y * 100)}%`}
      style={{
        position: "absolute",
        left: `calc(${x * 100}% - 6px)`,
        top:  `calc(${y * 100}% - 6px)`,
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: "rgba(239, 68, 68, 0.85)",
        border: "2px solid white",
        boxShadow: "0 1px 4px rgba(0,0,0,0.7)",
        pointerEvents: "none",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// ScreenshotHalf — one still-image pane.
//
// Used for STAND and AIM panes (the two stand-in jobs). Renders the image
// when url is non-null, otherwise a "No screenshot" empty state. Corner
// label overlays in top-left. Children render on top (used by AIM to host
// the anchor dot).
// ---------------------------------------------------------------------------
interface ScreenshotHalfProps {
  url: string | null;
  alt: string;
  label: string;
  children?: React.ReactNode;
}

export function ScreenshotHalf({ url, alt, label, children }: ScreenshotHalfProps) {
  return (
    <div className="flex-1 min-w-0 relative bg-muted/20 aspect-video overflow-hidden">
      {url ? (
        <img
          src={url}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          No screenshot
        </div>
      )}
      <CornerLabel>{label}</CornerLabel>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClipView (PR2) — gif-style looping throw clip, in-view autoplay.
//
// The src is lazily attached on first view so off-screen clips never fetch;
// only clips scrolled into view play (a glance board can hold dozens — letting
// them all decode at once tanks the second-monitor frame rate). After PR4
// this lives in the bottom-left THROW pane alongside the still panes.
// ---------------------------------------------------------------------------
interface ClipViewProps {
  clipUrl: string;
  posterUrl: string | null;
  title: string;
}

export function ClipView({ clipUrl, posterUrl, title }: ClipViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Sticky once the tile has been seen: keep the src attached (re-fetching on
  // every scroll-by is worse than keeping a paused decoded clip).
  const [armed, setArmed] = useState(false);
  // True while the tile is on screen — drives play/pause in a separate effect
  // so play() never runs before React has committed the src to the DOM.
  const [inView, setInView] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // A new clipUrl (re-processed clip / rotated presigned URL) is a different
  // clip — restart the lazy-load + error cycle.
  useEffect(() => {
    setArmed(false);
    setLoadFailed(false);
  }, [clipUrl]);

  // Observer lifecycle ONLY. disconnect() (not unobserve) is the correct
  // teardown — it covers React Strict Mode's mount→unmount→remount.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    // Degrade where IntersectionObserver is absent (old webviews / jsdom):
    // arm + treat as in view, let muted autoplay carry it.
    if (typeof IntersectionObserver === "undefined") {
      setArmed(true);
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          setArmed(true);
          setInView(true);
        } else {
          setInView(false);
        }
      },
      { threshold: 0.25 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Play/pause AFTER src is committed (depends on armed+inView). autoPlay
  // only fires on initial load, not on src reassignment, so re-entry needs
  // an explicit play().
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !armed) return;
    if (inView) {
      // Rejects under autoplay policy / before the src is ready — muted
      // autoplay will start it once loaded, so swallow the rejection.
      void el.play().catch(() => {});
    } else {
      el.pause();
      // Rewind so re-entry replays from the throw start (gif behaviour).
      // seekable is empty for not-yet-loaded / non-seekable streams — an
      // explicit check, not a silent try/catch (rules/no-bandaid).
      if (el.seekable.length > 0) {
        el.currentTime = 0;
      }
    }
  }, [armed, inView]);

  return (
    <div className="flex-1 min-w-0 relative bg-muted/20 aspect-video overflow-hidden">
      <video
        ref={videoRef}
        // Lazy: no src until the tile has been in view at least once.
        src={armed ? clipUrl : undefined}
        poster={posterUrl ?? undefined}
        muted
        loop
        autoPlay
        playsInline
        // Pre-view: metadata only. In view: allow buffering so the loop
        // doesn't stall on first frame.
        preload={armed ? "auto" : "metadata"}
        aria-label={`${title} — looping throw clip (muted)`}
        onError={() => setLoadFailed(true)}
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* Hide the "THROW" affordance when the clip fails to load (e.g. an
          expired presigned URL mid-session) — the poster (stand still)
          stays as the graceful fallback rather than a misleading badge. */}
      {!loadFailed && <CornerLabel>THROW</CornerLabel>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ThrowPlaceholder — empty state for the bottom-left pane when clip_url is
// null (no clip generated yet). Same dimensions + corner-label posture as
// ScreenshotHalf — reads as "this pane belongs to throw motion; nothing
// captured yet" rather than as a load failure.
// ---------------------------------------------------------------------------
export function ThrowPlaceholder() {
  return (
    <div className="flex-1 min-w-0 relative bg-muted/20 aspect-video overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
        No clip yet
      </div>
      <CornerLabel>THROW</CornerLabel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LandingPane — bottom-right pane. Shows where the utility lands.
//
// PR4 ships a text-only placeholder ("Lands in: <target_zone.name>") because
// no landing-clip extraction exists yet. PR5 will replace the placeholder
// with a real ~1-2s looping landing clip. The pane is the same dimensions
// either way — only the inner content changes.
// ---------------------------------------------------------------------------
interface LandingPaneProps {
  targetZoneName: string | null;
}

export function LandingPane({ targetZoneName }: LandingPaneProps) {
  return (
    <div className="flex-1 min-w-0 relative bg-muted/20 aspect-video overflow-hidden">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Lands in
        </span>
        <span className="text-sm font-semibold leading-tight max-w-full truncate">
          {targetZoneName ?? "—"}
        </span>
      </div>
      <CornerLabel>LANDING</CornerLabel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CornerLabel — small TL-corner uppercase label. Shared across all panes.
// ---------------------------------------------------------------------------
function CornerLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute top-1.5 left-2 text-[10px] font-semibold tracking-wider text-white/80 bg-black/40 px-1.5 py-0.5 rounded uppercase select-none pointer-events-none">
      {children}
    </span>
  );
}
