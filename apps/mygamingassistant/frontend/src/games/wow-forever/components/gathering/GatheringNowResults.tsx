import GatheringCappedBanner from "@/games/wow-forever/components/gathering/GatheringCappedBanner";
import GatheringNowCard from "@/games/wow-forever/components/gathering/GatheringNowCard";
import GatheringZoneList from "@/games/wow-forever/components/gathering/GatheringZoneList";
import { gatherNow } from "@/games/wow-forever/gathering/gatherNow";
import { nearestTrainer } from "@/games/wow-forever/gathering/nearestTrainer";
import { cappedRank } from "@/games/wow-forever/gathering/rankCaps";
import { rankZones } from "@/games/wow-forever/gathering/rankZones";
import type { GatheringData } from "@/games/wow-forever/types/gathering/gatheringData";
import type { GatheringGuide } from "@/games/wow-forever/types/gathering/gatheringGuide";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface GatheringNowResultsProps {
  guide: GatheringGuide;
  data: GatheringData;
  skill: number | null;
  faction: PlayerFaction;
  zoneId: number | null;
  level: number | null;
}

/** For your skill: the capped warning, what's worth skill now, and the zones to go to. */
export default function GatheringNowResults({ guide, data, skill, faction, zoneId, level }: GatheringNowResultsProps) {
  const capped = cappedRank(guide.ranks, skill);
  const zoneName = zoneId === null ? null : (data.zoneById.get(zoneId)?.name ?? null);
  const zones = rankZones({ nodes: data.nodes, skill, faction, level, zoneById: data.zoneById });
  return (
    <div className="space-y-3">
      {capped && <GatheringCappedBanner capped={capped} trainer={nearestTrainer(guide.trainers, faction, zoneName)} />}
      <GatheringNowCard now={gatherNow(data.nodes, skill)} verb={guide.verb} />
      <GatheringZoneList zones={zones} />
    </div>
  );
}
