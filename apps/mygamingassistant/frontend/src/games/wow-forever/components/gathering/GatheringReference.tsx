import GatheringCraftsSection from "@/games/wow-forever/components/gathering/GatheringCraftsSection";
import GatheringNodeTable from "@/games/wow-forever/components/gathering/GatheringNodeTable";
import type { GatheringDataState } from "@/games/wow-forever/types/gathering/gatheringDataState";
import type { GatheringGuide } from "@/games/wow-forever/types/gathering/gatheringGuide";

interface GatheringReferenceProps {
  guide: GatheringGuide;
  state: GatheringDataState;
  skill: number | null;
}

/** The collapsed reference tables. Shown once the data is in — the top section carries the loading and error states. */
export default function GatheringReference({ guide, state, skill }: GatheringReferenceProps) {
  if (state.status !== "ready") return null;
  const { nodes, crafts } = state.data;
  return (
    <div className="space-y-3">
      <GatheringNodeTable nodes={nodes} skill={skill} nodeLabel={guide.nodeLabel} />
      {guide.crafts && crafts && <GatheringCraftsSection crafts={guide.crafts} file={crafts} />}
    </div>
  );
}
