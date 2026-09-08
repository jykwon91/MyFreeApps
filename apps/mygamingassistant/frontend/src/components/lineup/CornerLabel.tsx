/**
 * CornerLabel — small TL-corner uppercase label. Shared across all panes.
 *
 * Split out of LineupPanes.tsx so each file holds a single component.
 * ``PANE_STEP_NUMBERS`` moves with it because nothing outside this component
 * reads the map.
 *
 * Used by every pane primitive plus LineupStillPreview.tsx (the glance-board
 * summary tile's no-motion 2-still body), so the always-visible summary and
 * the expanded storyboard share one label treatment instead of forking a
 * second copy.
 *
 * Step numbering: the four storyboard panes form an ordered sequence a
 * first-time viewer should read STAND → AIM → THROW → LANDING. When the
 * label is one of those canonical stage names we prepend a numbered badge
 * (1..4) so the reading order is unambiguous even to someone who has never
 * seen a lineup storyboard. Centralising the map here means every surface
 * that renders a pane (glance board, detail storyboard, still summary)
 * gets the numbering for free; any non-stage label just renders without a
 * badge.
 */
import type { ReactNode } from "react";

const PANE_STEP_NUMBERS: Record<string, number> = {
  STAND: 1,
  AIM: 2,
  THROW: 3,
  LANDING: 4,
};

export interface CornerLabelProps {
  children: ReactNode;
}

export function CornerLabel({ children }: CornerLabelProps) {
  const step =
    typeof children === "string" ? PANE_STEP_NUMBERS[children.toUpperCase()] : undefined;
  return (
    <span className="absolute top-1.5 left-2 inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider text-white/80 bg-black/40 px-1.5 py-0.5 rounded uppercase select-none pointer-events-none">
      {step !== undefined && (
        <span
          aria-hidden
          className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-white text-black text-[9px] font-bold leading-none tracking-normal"
        >
          {step}
        </span>
      )}
      <span>{children}</span>
    </span>
  );
}
