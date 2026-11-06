import GatheringCappedBanner from "@/games/wow-forever/components/gathering/GatheringCappedBanner";
import { nearestTrainer } from "@/games/wow-forever/gathering/nearestTrainer";
import { cappedRank } from "@/games/wow-forever/gathering/rankCaps";
import type { GatheringGuideBase } from "@/games/wow-forever/types/gathering/gatheringGuideBase";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface GatheringRankBannerProps {
  guide: GatheringGuideBase;
  skill: number | null;
  faction: PlayerFaction;
  /** Your zone's name, to send you to a trainer there; null when not set. */
  zoneName: string | null;
}

/** The capped banner when your skill sits on a rank's cap — nothing otherwise. */
export default function GatheringRankBanner({ guide, skill, faction, zoneName }: GatheringRankBannerProps) {
  const capped = cappedRank(guide.ranks, skill);
  if (!capped) return null;
  return <GatheringCappedBanner capped={capped} trainer={nearestTrainer(guide.trainers, faction, zoneName)} />;
}
