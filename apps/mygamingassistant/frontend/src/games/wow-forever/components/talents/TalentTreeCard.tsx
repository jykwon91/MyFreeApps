import type { ReactNode } from "react";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import TalentArrows from "@/games/wow-forever/components/talents/TalentArrows";
import { TALENT_GRID_HEIGHT_PX, TALENT_GRID_WIDTH_PX } from "@/games/wow-forever/data/talents/talentGridLayout";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { formatPoints } from "@/games/wow-forever/lib/talents/formatPoints";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

interface TalentTreeCardProps {
  tree: TalentTree;
  ranks: readonly number[];
  points: number;
  /** The tree name's heading level where the card sits. */
  heading: "h2" | "h3" | "h4";
  /** The grid's accessible name (says how to move around it). */
  gridLabel: string;
  /** The talent cells, positioned in the grid. */
  children: ReactNode;
}

/** One talent tree as the game draws it: its name and points, then the 7 × 4 grid with prerequisite arrows. */
export default function TalentTreeCard({ tree, ranks, points, heading: Heading, gridLabel, children }: TalentTreeCardProps) {
  return (
    <section aria-label={`${tree.name} talents`} className="rounded-xl border bg-card p-4 space-y-4" data-testid="talent-tree">
      <header className="flex items-center gap-2">
        <GameIcon icon={fileIcon(tree.icon)} size={24} alt="" />
        <Heading className="font-semibold">{tree.name}</Heading>
        <span className="ml-auto text-sm tabular-nums text-muted-foreground" data-testid="talent-tree-points">
          {formatPoints(points)}
        </span>
      </header>
      <div
        role="group"
        aria-label={gridLabel}
        className="relative mx-auto"
        style={{ width: TALENT_GRID_WIDTH_PX, height: TALENT_GRID_HEIGHT_PX }}
      >
        <TalentArrows tree={tree} ranks={ranks} />
        {children}
      </div>
    </section>
  );
}
