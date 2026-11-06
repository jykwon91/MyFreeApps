import MobGatheringGuideView from "@/games/wow-forever/components/gathering/MobGatheringGuideView";
import NodeGatheringGuideView from "@/games/wow-forever/components/gathering/NodeGatheringGuideView";
import { GATHERING_GUIDES } from "@/games/wow-forever/data/professions/gathering/gatheringGuides";
import { GATHERING_KIND } from "@/games/wow-forever/types/gathering/gatheringKind";
import type { GatheringProfession } from "@/games/wow-forever/types/gathering/gatheringProfession";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface GatheringGuideViewProps {
  profession: GatheringProfession;
  faction: PlayerFaction;
  zoneId: number | null;
  level: number | null;
}

/** A gathering profession's guide — from nodes on the ground or from mobs, as its `kind` says. */
export default function GatheringGuideView({ profession, ...player }: GatheringGuideViewProps) {
  const guide = GATHERING_GUIDES[profession];
  switch (guide.kind) {
    case GATHERING_KIND.nodes:
      return <NodeGatheringGuideView key={profession} profession={profession} guide={guide} {...player} />;
    case GATHERING_KIND.mobs:
      return <MobGatheringGuideView key={profession} profession={profession} guide={guide} {...player} />;
  }
}
