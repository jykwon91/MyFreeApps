/**
 * LineupStillPreview — the glance board's always-visible, no-motion summary.
 *
 * Renders exactly two stills, side by side: STAND (where to stand) and
 * LANDING (where the utility lands) — the two things an operator needs
 * mid-game, at a glance, with zero hover/click. This is the ONLY body
 * content GlanceBoardTile renders by default; the full 4-pane storyboard
 * (with clip/knob support) only mounts when the operator explicitly
 * expands the tile — see the knob-boundary comment in GlanceBoardTile.tsx.
 *
 * Deliberately takes no `knobs` prop. There is nothing to configure here —
 * this component hard-codes still-only rendering so it can never regress
 * into mounting a live <video> on every glance-board tile.
 *
 * Also exports MiniPosterThumb — a small always-decorative thumbnail used
 * by LineupListRow's compact text row (the row's own aria-label already
 * carries the zone names, so the thumbnails don't need independent alt
 * text).
 */
import { ImageOff } from "lucide-react";
import type { Lineup } from "@/types/game";
import { CornerLabel, ScreenshotHalf } from "./LineupPanes";

interface LineupStillPreviewProps {
  lineup: Lineup;
}

// ---------------------------------------------------------------------------
// LandingStill — LANDING half of the 2-still row.
//
// Fallback chain (priority order):
//   1. landing_screenshot_url (real still image)
//   2. "Lands in: <zone>" text card — verbatim shape reused from
//      LineupPanes.tsx's LandingPane text fallback, so the two surfaces read
//      identically when neither has motion.
//   3. em-dash, when the zone itself is also null (already covered by the
//      `targetZoneName ?? "—"` fallback below).
//
// Deliberately does NOT fall back to aim_screenshot_url — that still shows
// the player's aim reference, not where the utility actually lands; showing
// it under a "LANDING" label would misinform the operator.
// ---------------------------------------------------------------------------
function LandingStill({
  url,
  targetZoneName,
  title,
}: {
  url: string | null;
  targetZoneName: string | null;
  title: string;
}) {
  if (url) {
    return (
      <div className="flex-1 min-w-0 relative bg-muted/20 aspect-video overflow-hidden">
        <img
          src={url}
          alt={`${title} — landing`}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
          loading="lazy"
          decoding="async"
        />
        <CornerLabel>LANDING</CornerLabel>
      </div>
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

export default function LineupStillPreview({ lineup }: LineupStillPreviewProps) {
  return (
    <div className="flex divide-x divide-border">
      {/* STAND — reuses ScreenshotHalf verbatim, including its own
          "No screenshot" empty state when stand_screenshot_url is null. */}
      <ScreenshotHalf
        url={lineup.stand_screenshot_url}
        alt={`${lineup.title} — stand position`}
        label="STAND"
      />
      <LandingStill
        url={lineup.landing_screenshot_url}
        targetZoneName={lineup.target_zone?.name ?? null}
        title={lineup.title}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MiniPosterThumb — 128x72px (16:9) thumbnail for LineupListRow's compact
// text row. Large enough to actually read the stand/landing framing at a
// glance without expanding the row. Always aria-hidden: the row's own
// aria-label already states the target/stand zone names, so a redundant
// accessible name here would just be noise for screen-reader users.
// ---------------------------------------------------------------------------
export function MiniPosterThumb({ url }: { url: string | null }) {
  if (!url) {
    return (
      <span
        aria-hidden
        className="inline-flex items-center justify-center w-32 h-[72px] shrink-0 rounded bg-muted/40"
      >
        <ImageOff className="w-5 h-5 text-muted-foreground/50" />
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      aria-hidden
      className="w-32 h-[72px] shrink-0 rounded object-cover"
      draggable={false}
      loading="lazy"
      decoding="async"
    />
  );
}
