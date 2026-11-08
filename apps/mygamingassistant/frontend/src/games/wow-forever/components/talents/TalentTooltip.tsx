import type { Placement } from "@floating-ui/react-dom";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import TalentRankText from "@/games/wow-forever/components/talents/TalentRankText";
import { talentRankLines } from "@/games/wow-forever/lib/talents/talentRankLines";
import type { Talent } from "@/games/wow-forever/types/talents/talent";

interface TalentTooltipProps {
  id: string;
  talent: Talent;
  rank: number;
  /** Why a point can't go in right now, or null. */
  blocked: string | null;
  setFloating: (node: HTMLElement | null) => void;
  floatingStyles: CSSProperties;
  isPositioned: boolean;
  placement: Placement;
}

/** A talent's hover / focus tooltip, portalled to `<body>` so the tree's box never clips it. */
export default function TalentTooltip({
  id,
  talent,
  rank,
  blocked,
  setFloating,
  floatingStyles,
  isPositioned,
  placement,
}: TalentTooltipProps) {
  return createPortal(
    <div
      ref={setFloating}
      id={id}
      role="tooltip"
      data-testid="talent-tooltip"
      data-placement={placement}
      style={{ ...floatingStyles, visibility: isPositioned ? "visible" : "hidden" }}
      className="pointer-events-none z-50 w-72 max-w-[calc(100vw-16px)] space-y-2 rounded-lg border bg-card p-3 shadow-lg"
    >
      <div>
        <p className="font-semibold">{talent.name}</p>
        <p className="text-xs text-muted-foreground">
          Rank {rank}/{talent.ranks.length}
        </p>
      </div>
      <TalentRankText lines={talentRankLines(talent, rank)} badges={false} />
      {blocked ? <p className="text-xs text-red-600 dark:text-red-400">{blocked}</p> : null}
    </div>,
    document.body,
  );
}
