/**
 * ThrowPlaceholder — empty state for the bottom-left pane when clip_url is
 * null. Same dimensions + corner-label posture as ScreenshotHalf, so it reads
 * as "this pane belongs to throw motion" rather than as a load failure.
 *
 * Split out of LineupPanes.tsx so each file holds a single component.
 *
 * A null clip_url means one of two very different things, and the copy has to
 * tell them apart or the operator cannot tell a complete lineup from a broken
 * one:
 *
 *   thrown utility — the clip genuinely has not been generated yet. This is a
 *     gap; "No clip yet" is an accurate to-do.
 *   placed utility — trapwire, spycam, alarmbot, turret, trademark, sonic
 *     sensor. Mounted at the player's own position, so nothing is ever in
 *     flight and there is no throw beat to film. The lineup is COMPLETE at
 *     three beats; "No clip yet" would be a standing lie about missing work.
 */
import type { UtilityPlacement } from "../../types/game";
import { CornerLabel } from "./CornerLabel";

export interface ThrowPlaceholderProps {
  placement?: UtilityPlacement;
}

export function ThrowPlaceholder({ placement = "thrown" }: ThrowPlaceholderProps) {
  const isPlaced = placement === "placed";
  return (
    <div className="flex-1 min-w-0 relative bg-muted/20 aspect-video overflow-hidden">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-2 text-center">
        <span className="text-xs text-muted-foreground">
          {isPlaced ? "Placed — no throw" : "No clip yet"}
        </span>
        {isPlaced ? (
          <span className="text-[10px] text-muted-foreground/70">
            Mounted in place
          </span>
        ) : null}
      </div>
      <CornerLabel>THROW</CornerLabel>
    </div>
  );
}
