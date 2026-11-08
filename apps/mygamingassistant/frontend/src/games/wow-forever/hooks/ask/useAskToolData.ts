import { useMemo } from "react";
import { loadGoldFarms } from "@/games/wow-forever/gold/loadGoldFarms";
import { loadProfessionRoute } from "@/games/wow-forever/lib/ask/loadProfessionRoute";
import { loadClientItems } from "@/games/wow-forever/lib/clientItemsLoader";
import { loadDungeons } from "@/games/wow-forever/lib/dungeons/loadDungeons";
import { loadRares } from "@/games/wow-forever/lib/rares/loadRares";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { fetchAskPrices, fetchAskServerStatus } from "@/games/wow-forever/lib/ask/askLiveData";
import { loadAskWalkGraphs } from "@/games/wow-forever/lib/ask/loadAskWalkGraphs";
import { useWorldMap } from "@/games/wow-forever/hooks/useWorldMap";
import { useWowRegion } from "@/games/wow-forever/hooks/useWowRegion";
import type { AskToolData } from "@/games/wow-forever/types/ask/askToolData";
import type { AskToolDataState } from "@/games/wow-forever/types/ask/askToolDataState";
import { buildPlaces } from "@/games/wow-forever/worldMap/places";

/**
 * The World Map loads with the page (every NPC and place answer needs it) —
 * the same merged data the map page uses, with the "Seen in game" captures over Classic;
 * everything else loads the first time Claude asks for it.
 */
export function useAskToolData(): AskToolDataState {
  const { status, data: world, retry } = useWorldMap();
  const [player, updatePlayer] = usePlayerSettings();
  const [region] = useWowRegion();
  const places = useMemo(() => (world ? buildPlaces(world) : []), [world]);
  const data = useMemo<AskToolData | null>(
    () =>
      world
        ? {
            world,
            places,
            loadItems: loadClientItems,
            loadDungeons,
            loadWalkGraphs: loadAskWalkGraphs,
            loadRares,
            loadGoldFarms,
            loadProfessionRoute,
            loadPrices: fetchAskPrices,
            loadServerStatus: fetchAskServerStatus,
            player,
            region,
          }
        : null,
    [world, places, player, region],
  );
  return { status, data, retry, player, updatePlayer };
}
