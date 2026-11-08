import { useMemo } from "react";
import { loadClientItems } from "@/games/wow-forever/lib/clientItemsLoader";
import { loadDungeons } from "@/games/wow-forever/lib/dungeons/loadDungeons";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { useWorldMapData } from "@/games/wow-forever/hooks/useWorldMapData";
import type { AskToolData } from "@/games/wow-forever/types/ask/askToolData";
import type { AskToolDataState } from "@/games/wow-forever/types/ask/askToolDataState";
import { buildPlaces } from "@/games/wow-forever/worldMap/places";

/**
 * The World Map loads with the page (every NPC and place answer needs it);
 * the item list and dungeons load the first time Claude asks for them.
 */
export function useAskToolData(): AskToolDataState {
  const { status, data: world, retry } = useWorldMapData();
  const [player, updatePlayer] = usePlayerSettings();
  const places = useMemo(() => (world ? buildPlaces(world) : []), [world]);
  const data = useMemo<AskToolData | null>(
    () => (world ? { world, places, loadItems: loadClientItems, loadDungeons, player } : null),
    [world, places, player],
  );
  return { status, data, retry, player, updatePlayer };
}
