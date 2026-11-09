import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import type { GoldFarm } from "@/games/wow-forever/gold/goldFarms";
import type { PlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import type { AskProfessionRoute } from "@/games/wow-forever/types/ask/askProfessionRoute";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";
import type { DungeonsData } from "@/games/wow-forever/types/dungeons/dungeonsData";
import type { PriceHouse } from "@/games/wow-forever/types/priceHouse";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";
import type { RaresData } from "@/games/wow-forever/types/rares/raresData";
import type { ServerStatusResponse } from "@/games/wow-forever/types/serverStatus/serverStatusResponse";
import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import type { WowRegion } from "@/games/wow-forever/types/wowRegion";
import type { WalkGraphs } from "@/games/wow-forever/worldMap/directions";
import type { Place } from "@/games/wow-forever/worldMap/places";

/**
 * What the tools run against: the World Map (loaded with the page), the rest
 * (loaded on first use), the live prices and server status (fetched when asked),
 * and the saved player and region.
 */
export interface AskToolData {
  world: WorldMapData;
  places: readonly Place[];
  loadItems: () => Promise<ClientItemList>;
  loadDungeons: () => Promise<DungeonsData>;
  /** Walk graphs for these continents; one that won't load is left out and its walks are straight lines. */
  loadWalkGraphs: (continents: readonly number[]) => Promise<WalkGraphs>;
  loadRares: () => Promise<RaresData>;
  loadGoldFarms: () => Promise<readonly GoldFarm[]>;
  loadProfessionRoute: (profession: GuideProfession) => Promise<AskProfessionRoute>;
  /** The live data: same endpoints and cache as the Auction house and Server status pages. */
  loadPrices: (house: PriceHouse) => Promise<PriceListResponse>;
  loadServerStatus: (region: WowRegion) => Promise<ServerStatusResponse>;
  player: PlayerSettings;
  /** The player's saved server status region. */
  region: WowRegion;
}
