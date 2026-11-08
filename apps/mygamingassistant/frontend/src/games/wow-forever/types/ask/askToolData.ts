import type { PlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";
import type { DungeonsData } from "@/games/wow-forever/types/dungeons/dungeonsData";
import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import type { WalkGraphs } from "@/games/wow-forever/worldMap/directions";
import type { Place } from "@/games/wow-forever/worldMap/places";

/** What the tools run against: the World Map (loaded with the page), the item list and dungeons (loaded on first use), and the saved player. */
export interface AskToolData {
  world: WorldMapData;
  places: readonly Place[];
  loadItems: () => Promise<ClientItemList>;
  loadDungeons: () => Promise<DungeonsData>;
  /** Walk graphs for these continents; one that won't load is left out and its walks are straight lines. */
  loadWalkGraphs: (continents: readonly number[]) => Promise<WalkGraphs>;
  player: PlayerSettings;
}
