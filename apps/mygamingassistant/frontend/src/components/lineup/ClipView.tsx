/**
 * ClipView — gif-style looping clip, in-view autoplay.
 *
 * Split out of LineupPanes.tsx so each file holds a single component.
 *
 * The src is lazily attached on first view so off-screen clips never fetch;
 * only clips scrolled into view play (a glance board can hold dozens — letting
 * them all decode at once tanks the second-monitor frame rate). The same
 * primitive renders the THROW and LANDING panes; only the label + URL differ,
 * so the aria-label and loading behaviour are shared byte-for-byte.
 *
 * **Arm lifecycle (post-perf-fix):** ``armed`` flips ON when the tile enters
 * the viewport and OFF when it leaves — i.e. the src attribute is detached on
 * scroll-out, not just paused. The pre-fix sticky-arm behaviour decoded every
 * clip the operator had ever scrolled past, accumulating GPU-held frames as
 * the operator browsed a large map (each ``map`` page mounts 4 video tags
 * per lineup × N lineups, and a CS2 map can carry 60-80 lineups). The
 * trade-off: scroll-back-in re-fetches the MP4 from MinIO instead of
 * re-using a decoded clip, costing ~100-300ms before the loop starts
 * playing again. That's worth bounding worst-case memory; the alternative
 * is unbounded growth.
 */
import { useEffect, useRef, useState } from "react";
import { CornerLabel } from "./CornerLabel";

export interface ClipViewProps {
  clipUrl: string;
  posterUrl: string | null;
  title: string;
  // Corner label (uppercase, ~10px). THROW-pane callers rely on the default;
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
