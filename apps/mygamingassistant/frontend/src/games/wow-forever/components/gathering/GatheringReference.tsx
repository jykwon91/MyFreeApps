import GatheringCraftsSection from "@/games/wow-forever/components/gathering/GatheringCraftsSection";
import GatheringNodeTable from "@/games/wow-forever/components/gathering/GatheringNodeTable";
import type { GatheringData } from "@/games/wow-forever/types/gathering/gatheringData";
import type { NodeGatheringGuide } from "@/games/wow-forever/types/gathering/nodeGatheringGuide";

interface GatheringReferenceProps {
  guide: NodeGatheringGuide;
  data: GatheringData;
  skill: number | null;
}

/** A node guide's collapsed reference tables: every node, then its crafts. */
export default function GatheringReference({ guide, data, skill }: GatheringReferenceProps) {
  return (
    <div className="space-y-3">
      <GatheringNodeTable nodes={data.nodes} skill={skill} nodeLabel={guide.nodeLabel} />
      {guide.crafts && data.crafts && <GatheringCraftsSection crafts={guide.crafts} file={data.crafts} />}
    </div>
  );
}
