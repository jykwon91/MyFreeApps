/**
 * LineupCard — displays a single lineup in one of two variants:
 *   expanded   — 2×2 storyboard (STAND | AIM / THROW | LANDING) + metadata
 *                + notes + zone context, used by LineupDetailPanel
 *   thumbnail  — stand image only (small), title underneath, used in lists
 *
 * The expanded variant shares its pane primitives (ScreenshotHalf, AimAnchorDot,
 * ClipView, ThrowPlaceholder, LandingPane) with GlanceBoardTile via
 * LineupPanes.tsx — both surfaces converge on the same 4-pane shape so a
 * change in pane behavior lands on both at once.
 *
 * Pin toggle:
 *   Pass isPinned + onPinToggle to show the pin button in either variant.
 *   The button appears in the card header (expanded) or top-right corner (thumbnail).
 */
import { Clock } from "lucide-react";
import type { Lineup } from "@/types/game";
import PinButton from "./PinButton";
import {
  AimAnchorDot,
  ClipView,
  LandingPane,
  ScreenshotHalf,
  ThrowPlaceholder,
} from "./LineupPanes";

interface LineupCardProps {
  lineup: Lineup;
  variant: "expanded" | "thumbnail";
  onClick?: () => void;
  isPinned?: boolean;
  onPinToggle?: () => void;
}

const SIDE_LABELS: Record<string, string> = {
  side_a: "A",
  side_b: "B",
  any: "Both",
};

export default function LineupCard({
  lineup,
  variant,
  onClick,
  isPinned = false,
  onPinToggle,
}: LineupCardProps) {
  if (variant === "thumbnail") {
    return (
      <div className="relative rounded-lg border bg-card overflow-hidden">
        <button
          type="button"
          onClick={onClick}
          className="flex flex-col items-center gap-1.5 hover:bg-muted/40 transition-colors text-left w-full"
          aria-label={`View ${lineup.title}`}
        >
          <div className="w-full aspect-video bg-muted/20 overflow-hidden rounded-t-lg">
            {lineup.stand_screenshot_url ? (
              <img
                src={lineup.stand_screenshot_url}
                alt={`${lineup.title} — stand position`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                No screenshot
              </div>
            )}
          </div>
          <span className="px-2 pb-2 text-xs font-medium text-center leading-tight line-clamp-2">
            {lineup.title}
          </span>
        </button>

        {onPinToggle !== undefined && (
          <div className="absolute top-1 right-1">
            <PinButton
              isPinned={isPinned}
              onToggle={onPinToggle}
              className="bg-background/80 backdrop-blur-sm"
            />
          </div>
        )}
      </div>
    );
  }

  // Expanded variant — 2×2 storyboard shared with GlanceBoardTile.
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-start justify-between gap-3 border-b">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm leading-tight">{lineup.title}</h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {lineup.utility_type && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">
                {lineup.utility_type.name}
              </span>
            )}
            {lineup.side && (
              <span className="text-xs text-muted-foreground">
                Side: {SIDE_LABELS[lineup.side] ?? lineup.side}
              </span>
            )}
            {lineup.setup_seconds != null && (
              <span className="text-xs flex items-center gap-0.5 text-muted-foreground">
                <Clock className="w-3 h-3" />
                {lineup.setup_seconds}s
              </span>
            )}
            {lineup.technique && (
              <span className="text-xs text-muted-foreground truncate" title={lineup.technique}>
                · {lineup.technique}
              </span>
            )}
          </div>
        </div>

        {onPinToggle !== undefined && (
          <PinButton isPinned={isPinned} onToggle={onPinToggle} />
        )}
      </div>

      {/* Body: 2×2 storyboard — same primitives as GlanceBoardTile, identical
          per-pane shape so a player viewing the same lineup in either surface
          sees the same layout. */}
      <div className="flex flex-col divide-y divide-border">
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
        <div className="flex divide-x divide-border">
          {lineup.clip_url ? (
            <ClipView
              clipUrl={lineup.clip_url}
              posterUrl={lineup.stand_screenshot_url}
              title={lineup.title}
            />
          ) : (
            <ThrowPlaceholder />
          )}
          <LandingPane
            targetZoneName={lineup.target_zone?.name ?? null}
            landingClipUrl={lineup.landing_clip_url}
            posterUrl={lineup.aim_screenshot_url}
            title={lineup.title}
          />
        </div>
      </div>

      {/* Notes */}
      {lineup.notes && (
        <div className="px-4 py-3 border-t">
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{lineup.notes}</p>
        </div>
      )}

      {/* Zone context */}
      <div className="px-4 py-3 flex flex-wrap gap-2 text-xs text-muted-foreground border-t">
        {lineup.target_zone && (
          <span>Target: <span className="text-foreground">{lineup.target_zone.name}</span></span>
        )}
        {lineup.stand_zone && (
          <span>From: <span className="text-foreground">{lineup.stand_zone.name}</span></span>
        )}
      </div>
    </div>
  );
}
