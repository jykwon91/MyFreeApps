import GatheringNowCard from "@/games/wow-forever/components/gathering/GatheringNowCard";
import GatheringZoneList from "@/games/wow-forever/components/gathering/GatheringZoneList";
import { gatherNow } from "@/games/wow-forever/gathering/gatherNow";
import { rankZones } from "@/games/wow-forever/gathering/rankZones";
import type { GatheringData } from "@/games/wow-forever/types/gathering/gatheringData";
import type { NodeGatheringGuide } from "@/games/wow-forever/types/gathering/nodeGatheringGuide";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface GatheringNowResultsProps {
  guide: NodeGatheringGuide;
  data: GatheringData;
  skill: number | null;
  faction: PlayerFaction;
  level: number | null;
}

/** For your skill: the nodes worth skill now, and the zones to go to. */
export default function GatheringNowResults({ guide, data, skill, faction, level }: GatheringNowResultsProps) {
  const zones = rankZones({ nodes: data.nodes, skill, faction, level, zoneById: data.zoneById });
  return (
    <>
      <GatheringNowCard now={gatherNow(data.nodes, skill)} verb={guide.verb} />
      <GatheringZoneList zones={zones} />
    </>
  );
}
