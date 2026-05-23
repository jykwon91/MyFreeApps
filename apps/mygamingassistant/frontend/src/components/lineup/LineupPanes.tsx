/**
 * LineupPanes — shared pane primitives for the 4-pane lineup storyboard.
 *
 * Both GlanceBoardTile (glance-board surface) and LineupCard (detail-panel
 * surface) render the same 2×2 grid: STAND, AIM (2× zoom centered on the
 * persisted anchor coords), THROW (clip loop or empty state), LANDING.
 *
 * Extracted here so the two surfaces stay byte-equivalent — if pane
 * behaviour evolves we change it once and both surfaces follow. None of
 * these primitives manage their own grid; the caller arranges them inside a
 * flex row container.
 */
import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Aim anchor dot — 12px red filled circle, white outline, drop shadow.
//
// Positioned via CSS-absolute at (x*width, y*height) within an aspect-video
// pane. Receives normalized coords (0..1). The 4-pane storyboard's AIM pane
// no longer renders this — AimPane now zooms into the anchor instead (the
// zoomed crop is the affordance). Kept as an exported primitive for any
// future caller that wants a literal dot overlay.
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
// label overlays in top-left. ``imgStyle`` lets the caller apply CSS to the
// <img> (used by AimPane to zoom into the persisted anchor — overflow-hidden
// on the wrapper crops the zoomed content to pane bounds).
// ---------------------------------------------------------------------------
interface ScreenshotHalfProps {
  url: string | null;
  alt: string;
  label: string;
  imgStyle?: React.CSSProperties;
}

export function ScreenshotHalf({ url, alt, label, imgStyle }: ScreenshotHalfProps) {
  return (
    <div className="flex-1 min-w-0 relative bg-muted/20 aspect-video overflow-hidden">
      {url ? (
        <img
          src={url}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
          style={imgStyle}
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          No screenshot
        </div>
      )}
      <CornerLabel>{label}</CornerLabel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClipView (PR2) — gif-style looping clip, in-view autoplay.
//
// The src is lazily attached on first view so off-screen clips never fetch;
// only clips scrolled into view play (a glance board can hold dozens — letting
// them all decode at once tanks the second-monitor frame rate). After PR4
// this lives in the bottom-left THROW pane alongside the still panes, and
// after PR5 the same primitive renders the bottom-right LANDING pane (with
// a different label + URL).
//
// PR5 generalised the corner label to a prop so both THROW and LANDING use
// the same byte-for-byte primitive. The aria-label and loading behaviour are
// shared — only the label + URL differ between the two surfaces.
//
// **Arm lifecycle (post-perf-fix):** ``armed`` flips ON when the tile enters
// the viewport and OFF when it leaves — i.e. the src attribute is detached on
// scroll-out, not just paused. The pre-fix sticky-arm behaviour decoded every
// clip the operator had ever scrolled past, accumulating GPU-held frames as
// the operator browsed a large map (each ``map`` page mounts 4 video tags
// per lineup × N lineups, and a CS2 map can carry 60-80 lineups). The
// trade-off: scroll-back-in re-fetches the MP4 from MinIO instead of
// re-using a decoded clip, costing ~100-300ms before the loop starts
// playing again. That's worth bounding worst-case memory; the alternative
// is unbounded growth.
// ---------------------------------------------------------------------------
interface ClipViewProps {
  clipUrl: string;
  posterUrl: string | null;
  title: string;
  // Corner label (uppercase, ~10px). PR2 callers pass "THROW"; PR5's
  // LandingPane passes "LANDING". Default kept as "THROW" so any new caller
  // that forgets to pass it gets the historical behaviour, not a blank
  // label.
  label?: string;
  // Optional CSS on the <video> element. AimPane uses this to apply a
  // ``transform: scale(2)`` with ``transformOrigin`` set from the persisted
  // aim-anchor coords — the zoomed crop is the affordance that replaced the
  // old red dot. Wrapper has ``overflow-hidden`` so the zoom is bounded.
  videoStyle?: React.CSSProperties;
}

export function ClipView({ clipUrl, posterUrl, title, label = "THROW", videoStyle }: ClipViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // ``armed`` controls whether the <video> has a src attached. The tile arms
  // on viewport entry and DISARMS on viewport exit (post-perf-fix; was
  // sticky-armed previously). Disarming detaches the src so the browser can
  // release decoded frames + the underlying HTTP connection — critical for
  // grids that mount dozens of looping H.264 streams.
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
          // Scroll-out: pause (via inView=false → play/pause effect) AND
          // detach src (via armed=false → src={undefined}). The previous
          // sticky-arm kept decoded frames around forever; on a 60-lineup
          // map that exhausts GPU memory and browser connection slots.
          setInView(false);
          setArmed(false);
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
        aria-label={`${title} — looping ${label.toLowerCase()} clip (muted)`}
        onError={() => setLoadFailed(true)}
        className="absolute inset-0 w-full h-full object-cover"
        style={videoStyle}
      />
      {/* Hide the corner affordance when the clip fails to load (e.g. an
          expired presigned URL mid-session) — the poster stays as the
          graceful fallback rather than a misleading badge. */}
      {!loadFailed && <CornerLabel>{label}</CornerLabel>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StandPane (PR6) — top-left pane. Shows the player's stand position.
//
// Renders the looping 1s micro-clip via ``ClipView`` when ``standClipUrl`` is
// set, otherwise falls back to the original ``ScreenshotHalf`` still. The
// micro-clip is anchored on the same classifier-chosen frame as the still, so
// the swap is a visual upgrade — the framing matches frame-for-frame.
//
// Silent-fallback shape mirrors PR2's THROW pane: a missing clip URL must
// never read as a broken/error state, just as the still rendering.
// ---------------------------------------------------------------------------
interface StandPaneProps {
  // Pre-PR6 stand still — the always-valid graceful degradation.
  standScreenshotUrl: string | null;
  // PR6 — presigned MinIO key for the stand 1s loop. Null/undefined falls
  // back to the still.
  standClipUrl?: string | null;
  // Title carried into the ClipView aria-label when the clip is rendered.
  title: string;
}

export function StandPane({ standScreenshotUrl, standClipUrl, title }: StandPaneProps) {
  if (standClipUrl) {
    return (
      <ClipView
        clipUrl={standClipUrl}
        posterUrl={standScreenshotUrl}
        title={title}
        label="STAND"
      />
    );
  }
  return (
    <ScreenshotHalf
      url={standScreenshotUrl}
      alt={`${title} — stand position`}
      label="STAND"
    />
  );
}

// ---------------------------------------------------------------------------
// AimPane — top-right pane. Shows the player's crosshair-aim view.
//
// Same upgrade-with-still-fallback shape as ``StandPane``. Where StandPane
// renders the source frame as-is, AimPane applies a 2× zoom centered on the
// frame middle — the operator sees a magnified crop on the crosshair area,
// which replaces the old red anchor dot.
//
// Zoom origin is pinned to (50%, 50%) (operator-confirmed 2026-05-23: the
// crosshair in tactical FPS is always at screen center, so the alignment
// marker at the aim moment is also at screen center). The persisted
// ``aim_anchor_x/y`` coords (still passed through ``aimAnchorX/Y`` props
// for legacy / backward-compat reasons) are intentionally ignored — they
// were grid-classifier-derived from a different aim frame than the AIM
// clip is now anchored on (PR shifting AIM_TS to release_ts − 0.8s), so
// trusting them would re-introduce drift. The DB column itself is
// vestigial and can be cleaned up in a follow-up PR.
// ---------------------------------------------------------------------------
interface AimPaneProps {
  aimScreenshotUrl: string | null;
  aimClipUrl?: string | null;
  // Persisted anchor coords. Vestigial since 2026-05-23 — ignored at render
  // time (zoom is always centered). Kept on the prop for now so callers
  // don't break; remove when the DB column is dropped.
  aimAnchorX: number | null;
  aimAnchorY: number | null;
  title: string;
}

const AIM_ZOOM_STYLE: React.CSSProperties = {
  transform: "scale(2)",
  transformOrigin: "50% 50%",
};

export function AimPane({
  aimScreenshotUrl,
  aimClipUrl,
  // aim_anchor_x/y are vestigial (see component header). Destructure them so
  // the prop interface stays unchanged for callers, then ignore.
  aimAnchorX: _aimAnchorX,
  aimAnchorY: _aimAnchorY,
  title,
}: AimPaneProps) {
  if (aimClipUrl) {
    return (
      <ClipView
        clipUrl={aimClipUrl}
        posterUrl={aimScreenshotUrl}
        title={title}
        label="AIM"
        videoStyle={AIM_ZOOM_STYLE}
      />
    );
  }
  return (
    <ScreenshotHalf
      url={aimScreenshotUrl}
      alt={`${title} — aim reference`}
      label="AIM"
      imgStyle={AIM_ZOOM_STYLE}
    />
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
// PR5: when ``landingClipUrl`` is set we render a looping muted clip via the
// shared ``ClipView`` primitive (same lazy-load + in-view autoplay + load-
// failure tolerance as the THROW pane — the two surfaces are byte-equivalent
// except for the corner label and the source URL). When the clip key is
// null — pre-PR5 lineups, ingest's landing pass skipped (PR2 confidence
// gate didn't clear), or the chapter was too short for a clean cut — we
// gracefully degrade to the original "Lands in: <zone>" text. This is the
// same silent-fallback shape PR2 uses for the THROW pane (stills when clip
// is null) — never a misleading "video unavailable" placeholder.
// ---------------------------------------------------------------------------
interface LandingPaneProps {
  targetZoneName: string | null;
  // PR5 — presigned MinIO key for the landing clip. Null/undefined falls
  // back to text rendering. Optional for backwards-compat with existing
  // call sites that haven't been updated yet (they get the pre-PR5 text
  // behaviour, never a runtime error).
  landingClipUrl?: string | null;
  // Poster shown before the clip loads / on a load failure. The aim still
  // is the closest existing artifact to the landing view (the player's
  // line-of-sight when throwing) — better than a blank black pane when the
  // clip is slow or unreachable. Optional; defaults to no poster.
  posterUrl?: string | null;
  // Title used by ClipView's aria-label. Defaults to a derived label so
  // existing call sites don't have to pass it; pass an explicit title (e.g.
  // the lineup title) when one is meaningful.
  title?: string;
}

export function LandingPane({
  targetZoneName,
  landingClipUrl,
  posterUrl = null,
  title,
}: LandingPaneProps) {
  if (landingClipUrl) {
    return (
      <ClipView
        clipUrl={landingClipUrl}
        posterUrl={posterUrl}
        title={title ?? `Lands in ${targetZoneName ?? "unknown"}`}
        label="LANDING"
      />
    );
  }
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
