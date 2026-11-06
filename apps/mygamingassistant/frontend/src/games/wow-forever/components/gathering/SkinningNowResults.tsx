import SkinBandCard from "@/games/wow-forever/components/gathering/SkinBandCard";
import SkinningZoneList from "@/games/wow-forever/components/gathering/SkinningZoneList";
import { leatherForBand } from "@/games/wow-forever/gathering/leatherForBand";
import { rankSkinningZones } from "@/games/wow-forever/gathering/rankSkinningZones";
import type { SkinBand } from "@/games/wow-forever/types/gathering/skinBand";
import type { SkinningData } from "@/games/wow-forever/types/gathering/skinningData";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface SkinningNowResultsProps {
  data: SkinningData;
  band: SkinBand;
  faction: PlayerFaction;
}

/** For your skill and level: the beast levels to skin, and the zones to find them in. */
export default function SkinningNowResults({ data, band, faction }: SkinningNowResultsProps) {
  return (
    <>
      <SkinBandCard band={band} leathers={leatherForBand(data.leather, band)} />
      <SkinningZoneList zones={rankSkinningZones({ mobs: data.mobs, band, faction, zoneById: data.zoneById })} />
    </>
  );
}
