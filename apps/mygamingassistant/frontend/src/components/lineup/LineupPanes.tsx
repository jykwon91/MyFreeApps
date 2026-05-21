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
  // PR6 — overlay slot. AimPane mounts ``AimAnchorDot`` here so the dot sits
  // ON the clip pane (same aspect-video container, so the dot's normalized
  // coords still resolve to the same pixel position as the still-pane
  // counterpart). Optional; ClipView callers that don't need an overlay
  // (THROW, LANDING) pass nothing.
  children?: React.ReactNode;
}

export function ClipView({ clipUrl, posterUrl, title, label = "THROW", children }: ClipViewProps) {
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
        aria-label={`${title} — looping ${label.toLowerCase()} clip (muted)`}
        onError={() => setLoadFailed(true)}
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* Hide the corner affordance when the clip fails to load (e.g. an
          expired presigned URL mid-session) — the poster stays as the
          graceful fallback rather than a misleading badge. */}
      {!loadFailed && <CornerLabel>{label}</CornerLabel>}
      {/* PR6 — overlay slot for absolutely-positioned children (AimPane's
          anchor dot). Renders last so it sits on top of the video. */}
      {children}
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
// AimPane (PR6) — top-right pane. Shows the player's crosshair-aim view.
//
// Same upgrade-with-still-fallback shape as ``StandPane`` plus the persisted
// aim anchor overlay dot, which renders ON TOP of whichever surface is active
// (still or clip). Both surfaces are the same ``aspect-video`` container, so
// the dot's normalized coords resolve to the same pixel position regardless
// of which one is showing. The clip's first frame IS the still — anchoring on
// the same classifier-chosen timestamp keeps this invariant.
// ---------------------------------------------------------------------------
interface AimPaneProps {
  aimScreenshotUrl: string | null;
  aimClipUrl?: string | null;
  // Persisted normalized anchor coords. Null when the classifier didn't
  // produce them (manual upload / pre-classifier ingest) — the dot then
  // omits cleanly.
  aimAnchorX: number | null;
  aimAnchorY: number | null;
  title: string;
}

export function AimPane({
  aimScreenshotUrl,
  aimClipUrl,
  aimAnchorX,
  aimAnchorY,
  title,
}: AimPaneProps) {
  // Only render the anchor when both axes are set AND there's a base surface
  // to anchor over — a dot floating on the "No screenshot" empty state has no
  // meaning.
  const renderAnchor =
    aimAnchorX != null &&
    aimAnchorY != null &&
    (aimClipUrl != null || aimScreenshotUrl != null);
  const anchor = renderAnchor ? (
    <AimAnchorDot x={aimAnchorX!} y={aimAnchorY!} />
  ) : null;

  if (aimClipUrl) {
    return (
      <ClipView
        clipUrl={aimClipUrl}
        posterUrl={aimScreenshotUrl}
        title={title}
        label="AIM"
      >
        {anchor}
      </ClipView>
    );
  }
  return (
    <ScreenshotHalf
      url={aimScreenshotUrl}
      alt={`${title} — aim reference`}
      label="AIM"
    >
      {anchor}
    </ScreenshotHalf>
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
