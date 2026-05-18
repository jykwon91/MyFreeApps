/**
 * GlanceBoardTile — full-size tile for the glance board viewer.
 *
 * Designed for second-monitor use: both STAND and AIM screenshots rendered
 * at full size (~380px each, 16:9) with no click-to-expand. The detail IS
 * the default state.
 *
 * Layout:
 *   ┌───────────────────────────────────────────────┐
 *   │ [UTIL BADGE]  <title>            <side>·<from> │  header
 *   ├──────────────────────┬────────────────────────┤
 *   │   STAND screenshot   │   AIM screenshot        │  two 16:9 halves
 *   │   (label STAND)      │   (label AIM + dot)     │
 *   ├──────────────────────┴────────────────────────┤
 *   │  ⏱ <setup_seconds>s   [ — technique — ]        │  reserved footer
 *   └───────────────────────────────────────────────┘
 *
 * The footer is a PR2 placeholder — structure reserved, content muted.
 * notes are NOT displayed inline; they live in a title= tooltip.
 */
import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import type { Lineup } from "@/types/game";
import { utilDisplay } from "@/constants/utilityDisplay";

interface GlanceBoardTileProps {
  lineup: Lineup;
}

// ---------------------------------------------------------------------------
// Side chip — CS2-style T=gold / CT=blue / Both=neutral
// ---------------------------------------------------------------------------
const SIDE_CHIP: Record<string, { bg: string; text: string; label: string }> = {
  side_a: { bg: "bg-yellow-500/20 border border-yellow-500/50", text: "text-yellow-600 dark:text-yellow-400", label: "T" },
  side_b: { bg: "bg-blue-500/20 border border-blue-500/50",     text: "text-blue-600 dark:text-blue-400",     label: "CT" },
  any:    { bg: "bg-muted border border-border",                text: "text-muted-foreground",                label: "⊕" },
};

function SideChip({ side }: { side: string | null }) {
  const cfg = side ? (SIDE_CHIP[side] ?? SIDE_CHIP.any) : SIDE_CHIP.any;
  return (
    <span
      className={`inline-flex items-center justify-center h-5 min-w-[22px] px-1 rounded text-[11px] font-bold ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Aim anchor dot — 12px red circle, white outline, drop shadow
// (Identical spec to LineupCard's AimAnchorDot)
// ---------------------------------------------------------------------------
function AimAnchorDot({ x, y }: { x: number; y: number }) {
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
// Screenshot half
// ---------------------------------------------------------------------------
interface ScreenshotHalfProps {
  url: string | null;
  alt: string;
  label: string;
  children?: React.ReactNode;
}

function ScreenshotHalf({ url, alt, label, children }: ScreenshotHalfProps) {
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
      {/* Corner label */}
      <span className="absolute top-1.5 left-2 text-[10px] font-semibold tracking-wider text-white/80 bg-black/40 px-1.5 py-0.5 rounded uppercase select-none pointer-events-none">
        {label}
      </span>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clip view (PR2) — gif-style looping throw clip, in-view autoplay
//
// A lineup is a *motion*; two stills structurally cannot show it. When a clip
// exists it replaces the stand/aim split with a single muted looping video.
// Only clips scrolled into view play (a glance board can hold dozens — letting
// them all decode at once tanks the second-monitor frame rate). The src is
// lazily attached on first view so off-screen clips never fetch.
// ---------------------------------------------------------------------------
interface ClipViewProps {
  clipUrl: string;
  posterUrl: string | null;
  title: string;
}

function ClipView({ clipUrl, posterUrl, title }: ClipViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Sticky: once the tile has been seen, keep the src attached (re-fetching
  // on every scroll-by would be worse than keeping a paused decoded clip).
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    // Degrade gracefully where IntersectionObserver is unavailable (old
    // webviews / jsdom): arm immediately and let muted autoplay handle it.
    if (typeof IntersectionObserver === "undefined") {
      setArmed(true);
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          setArmed(true);
          // play() can reject (autoplay policy / src not yet ready) — the
          // muted+autoPlay attributes will start it once loaded, so the
          // rejection is safe to swallow.
          void el.play().catch(() => {});
        } else {
          el.pause();
          // Reset so re-entering the viewport replays from the throw start
          // (gif behaviour). Seeking before metadata loads throws — guard it.
          try {
            el.currentTime = 0;
          } catch {
            /* not seekable yet — fine, it'll start at 0 anyway */
          }
        }
      },
      { threshold: 0.25 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="relative bg-muted/20 aspect-video overflow-hidden">
      <video
        ref={videoRef}
        // Lazy: no src until the tile has been in view at least once.
        src={armed ? clipUrl : undefined}
        poster={posterUrl ?? undefined}
        muted
        loop
        autoPlay
        playsInline
        preload="metadata"
        aria-label={`${title} — looping throw clip (muted)`}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <span className="absolute top-1.5 left-2 text-[10px] font-semibold tracking-wider text-white/80 bg-black/40 px-1.5 py-0.5 rounded uppercase select-none pointer-events-none">
        Clip
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GlanceBoardTile
// ---------------------------------------------------------------------------
export default function GlanceBoardTile({ lineup }: GlanceBoardTileProps) {
  const ud = utilDisplay(lineup.utility_type?.slug);

  return (
    <article
      className="rounded-lg border bg-card overflow-hidden flex flex-col"
      aria-label={`${ud.label}: ${lineup.title} — ${lineup.side ?? "any"} side — target ${lineup.target_zone?.name ?? "unknown"}`}
      title={lineup.notes ?? undefined}
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b min-h-[36px]">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide flex-shrink-0 ${ud.badgeBg} ${ud.badgeText}`}
        >
          {ud.label.toUpperCase()}
        </span>
        <span className="flex-1 min-w-0 text-[13px] font-semibold leading-tight truncate">
          {lineup.title}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <SideChip side={lineup.side} />
          {lineup.stand_zone && (
            <span className="text-[11px] text-muted-foreground truncate max-w-[140px]">
              From: {lineup.stand_zone.name}
            </span>
          )}
        </div>
      </div>

      {/* ── Clip (PR2) if localised, else the stand/aim stills ────────── */}
      {lineup.clip_url ? (
        <ClipView
          clipUrl={lineup.clip_url}
          posterUrl={lineup.stand_screenshot_url}
          title={lineup.title}
        />
      ) : (
        <div className="flex divide-x divide-border">
          <ScreenshotHalf
            url={lineup.stand_screenshot_url}
            alt={`${lineup.title} — stand position`}
            label="STAND"
          />
          <ScreenshotHalf
            url={lineup.aim_screenshot_url}
            alt={`${lineup.title} — aim reference`}
            label="AIM"
          >
            {lineup.aim_screenshot_url &&
              lineup.aim_anchor_x != null &&
              lineup.aim_anchor_y != null && (
                <AimAnchorDot x={lineup.aim_anchor_x} y={lineup.aim_anchor_y} />
              )}
          </ScreenshotHalf>
        </div>
      )}

      {/* ── Footer — PR2 throw-technique placeholder ───────────────────── */}
      {/* PR2: throw-technique fields (throw type / mouse button / movement) land here */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-muted/30 border-t min-h-[28px]">
        {lineup.setup_seconds != null && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="w-3 h-3 flex-shrink-0" aria-hidden />
            {lineup.setup_seconds}s
          </span>
        )}
        <span className="text-[11px] text-muted-foreground/50 italic select-none">
          — technique —
        </span>
      </div>
    </article>
  );
}
