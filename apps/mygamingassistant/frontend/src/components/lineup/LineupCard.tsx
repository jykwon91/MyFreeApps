/**
 * LineupCard — displays a single lineup in one of two variants:
 *   expanded   — side-by-side stand + aim images, full metadata, aim anchor overlay
 *   thumbnail  — stand image only (small), title underneath
 *
 * The aim anchor circle renders at (aim_anchor_x * width, aim_anchor_y * height)
 * relative to the aim screenshot, using a CSS-absolute circle overlay.
 *
 * Pin toggle:
 *   Pass isPinned + onPinToggle to show the pin button in either variant.
 *   The button appears in the card header (expanded) or top-right corner (thumbnail).
 */
import { Clock } from "lucide-react";
import type { Lineup } from "@/types/game";
import PinButton from "./PinButton";

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

  // Expanded variant
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
          </div>
        </div>

        {onPinToggle !== undefined && (
          <PinButton isPinned={isPinned} onToggle={onPinToggle} />
        )}
      </div>

      {/* Screenshots */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
        {/* Stand screenshot */}
        <div>
          <p className="text-xs text-muted-foreground mb-1.5 font-medium">Stand position</p>
          <div className="rounded-md overflow-hidden bg-muted/20 aspect-video">
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
        </div>

        {/* Aim screenshot with anchor overlay */}
        <div>
          <p className="text-xs text-muted-foreground mb-1.5 font-medium">Aim reference</p>
          <div className="rounded-md overflow-hidden bg-muted/20 aspect-video relative">
            {lineup.aim_screenshot_url ? (
              <>
                <img
                  src={lineup.aim_screenshot_url}
                  alt={`${lineup.title} — aim reference`}
                  className="w-full h-full object-cover"
                />
                {lineup.aim_anchor_x != null && lineup.aim_anchor_y != null && (
                  <AimAnchorDot
                    x={lineup.aim_anchor_x}
                    y={lineup.aim_anchor_y}
                  />
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                No screenshot
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notes */}
      {lineup.notes && (
        <div className="px-4 pb-4">
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{lineup.notes}</p>
        </div>
      )}

      {/* Zone context */}
      <div className="px-4 pb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
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

/** Red crosshair dot positioned via CSS at the normalized anchor coords. */
function AimAnchorDot({ x, y }: { x: number; y: number }) {
  return (
    <div
      aria-label={`Aim anchor at ${Math.round(x * 100)}%, ${Math.round(y * 100)}%`}
      style={{
        position: "absolute",
        left: `calc(${x * 100}% - 6px)`,
        top: `calc(${y * 100}% - 6px)`,
        width: 12,
        height: 12,
        borderRadius: "50%",
        border: "2px solid rgba(239, 68, 68, 0.9)",
        background: "rgba(239, 68, 68, 0.3)",
        boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
        pointerEvents: "none",
      }}
    />
  );
}
