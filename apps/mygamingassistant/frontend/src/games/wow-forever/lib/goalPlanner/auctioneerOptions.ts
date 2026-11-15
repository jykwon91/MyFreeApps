import { SERVICE_KIND } from "@/games/wow-forever/data/worldMap/serviceKinds";
import { canBuyFrom } from "@/games/wow-forever/food/recipeSources";
import { poiOption } from "@/games/wow-forever/lib/goalPlanner/stopOptions";
import type { StopOption } from "@/games/wow-forever/types/goalPlanner/stopOption";
import type { PlayerFaction, WorldMapData } from "@/games/wow-forever/types/worldMap";

/** Every auctioneer on the World Map who'll serve your faction (your capitals' and the goblin towns'). */
export function auctioneerOptions(data: WorldMapData, faction: PlayerFaction): StopOption[] {
  return data.pois
    .filter((p) => p.subkind === SERVICE_KIND.auctioneer && canBuyFrom(p.faction, faction))
    .map((p) => poiOption(p, data.zoneById.get(p.zone)?.name ?? ""));
}
