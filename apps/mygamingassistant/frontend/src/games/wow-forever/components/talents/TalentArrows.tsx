import { useMemo } from "react";
import { TALENT_ARROW_MET, TALENT_ARROW_UNMET } from "@/games/wow-forever/data/talents/talentCellStyles";
import { TALENT_GRID_HEIGHT_PX, TALENT_GRID_WIDTH_PX } from "@/games/wow-forever/data/talents/talentGridLayout";
import { talentArrows } from "@/games/wow-forever/lib/talents/talentArrows";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

interface TalentArrowsProps {
  tree: TalentTree;
  ranks: readonly number[];
}

/** The tree's prerequisite arrows under its cells, green once the required talent has its ranks. */
export default function TalentArrows({ tree, ranks }: TalentArrowsProps) {
  const arrows = useMemo(() => talentArrows(tree), [tree]);
  return (
    <svg
      aria-hidden
      width={TALENT_GRID_WIDTH_PX}
      height={TALENT_GRID_HEIGHT_PX}
      className="pointer-events-none absolute left-0 top-0"
      data-testid="talent-arrows"
    >
      {arrows.map((arrow) => {
        const needed = tree.talents[arrow.to].prereqs.find((p) => p.talentIndex === arrow.from)?.rank ?? 0;
        const met = ranks[arrow.from] >= needed;
        return (
          <g key={`${arrow.from}-${arrow.to}`} className={met ? TALENT_ARROW_MET : TALENT_ARROW_UNMET} data-met={met}>
            <polyline points={arrow.line} className="fill-none" strokeWidth={3} />
            <polygon points={arrow.head} strokeWidth={0} />
          </g>
        );
      })}
    </svg>
  );
}
