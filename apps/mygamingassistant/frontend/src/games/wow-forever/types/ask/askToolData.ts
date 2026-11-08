import type { PlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";
import type { DungeonsData } from "@/games/wow-forever/types/dungeons/dungeonsData";
import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import type { Place } from "@/games/wow-forever/worldMap/places";

/** What the tools run against: the World Map (loaded with the page), the item list and dungeons (loaded on first use), and the saved player. */
export interface AskToolData {
  world: WorldMapData;
  places: readonly Place[];
  loadItems: () => Promise<ClientItemList>;
  loadDungeons: () => Promise<DungeonsData>;
  player: PlayerSettings;
}
