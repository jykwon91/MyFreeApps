import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { DOWNRANK_PROVENANCE_DETAIL } from "@/games/wow-forever/data/downrank/downrankLabels";
import type { DownrankRow } from "@/games/wow-forever/types/downrank/downrankRow";

interface DownrankRankLabelProps {
  row: DownrankRow;
}

/** "Rank 2", when it's learned and how long it keeps its full bonus; a Classic rank carries its badge. */
export default function DownrankRankLabel({ row }: DownrankRankLabelProps) {
  const { rank } = row;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-medium">
        Rank {rank.rank}{" "}
        {rank.from === "classic" ? <ProvenanceBadge provenance="classic" detail={DOWNRANK_PROVENANCE_DETAIL.classicRank} /> : null}
      </span>
      <span className="text-xs text-muted-foreground">
        {row.learnable ? `Learned at ${rank.level}` : `Learn at ${rank.level}`}
        {rank.fullBonusUntil !== null ? ` · full bonus to ${rank.fullBonusUntil}` : ""}
      </span>
    </span>
  );
}
